import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, mock, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ticketAudit, ticketOrders, ticketSettings } from "@masc-landing/db/schema/tickets";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

// Run the real checkout and inventory SQL against isolated PostgreSQL. Only the
// external database connection and payment provider are replaced; no secrets or
// configured database are used. PGlite serializes transactions on one connection.
const client = new PGlite();
const db = drizzle(client);
const buyer = { id: "buyer", email: "buyer@example.com" };
const otherBuyer = { id: "other-buyer", email: "other@example.com" };
const createPayment = mock.fn(async (input: { orderCode: number; amount: number; buyerName: string; buyerPhone: string }) => ({
	orderCode: input.orderCode, amount: input.amount, currency: "VND",
	paymentLinkId: String(input.orderCode), checkoutUrl: `https://pay.payos.vn/web/${input.orderCode}`,
}));

mock.module("@masc-landing/db", { namedExports: { db } });
mock.module("@masc-landing/db/ticket-transaction", { namedExports: {
	ticketTransaction: (work: Parameters<typeof db.transaction>[0]) => db.transaction(work),
} });
mock.module(new URL("./payos.ts", import.meta.url).href, { namedExports: {
	payos: () => ({ paymentRequests: { create: createPayment } }),
	orderReturnUrl: (id: string) => `https://example.com/tickets/orders/${id}`,
	checkoutUrl: (id: string) => `https://pay.payos.vn/web/${id}`,
	validCheckoutUrl: (url: string) => url.startsWith("https://pay.payos.vn/web/"),
} });
const { checkoutInput, startCheckout } = await import("./payments");

before(async () => {
	await client.exec(`
		CREATE TABLE ticket_settings (
			id integer PRIMARY KEY DEFAULT 1, is_sales_opened boolean NOT NULL DEFAULT false,
			vip_capacity integer NOT NULL DEFAULT 30,
			updated_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE ticket_packages (
			name text PRIMARY KEY, category text NOT NULL, quantity integer NOT NULL,
			price integer NOT NULL, benefits jsonb NOT NULL DEFAULT '[]'
		);
		CREATE TABLE ticket_orders (
			id text PRIMARY KEY, buyer_id text NOT NULL, request_key text NOT NULL,
			provider_order_code bigint UNIQUE NOT NULL, payment_link_id text UNIQUE, checkout_url text,
			snapshot jsonb NOT NULL, buyer_email text NOT NULL, buyer_name text, buyer_phone text,
			locale text NOT NULL, payment_status text NOT NULL DEFAULT 'creating',
			fulfillment_status text NOT NULL DEFAULT 'pending', reservation text NOT NULL DEFAULT 'none',
			settled_amount integer NOT NULL DEFAULT 0, issue text, expires_at timestamptz NOT NULL,
			paid_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
			updated_at timestamptz NOT NULL DEFAULT now(), create_attempted_at timestamptz,
			reconcile_attempts integer NOT NULL DEFAULT 0, next_reconcile_at timestamptz NOT NULL DEFAULT now(),
			reconcile_lease_until timestamptz, reconcile_lease_id text, reconcile_request_id text,
			last_verified_at timestamptz, provider_status text, checkout_closed_at timestamptz,
			resolution_note text, resolved_at timestamptz, resolved_by text,
			UNIQUE (buyer_id, request_key)
		);
		CREATE TABLE ticket_audit (
			id text PRIMARY KEY, actor_id text NOT NULL, action text NOT NULL, entity_id text,
			reason text, outcome text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE ticket_rate_limits (
			key text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), count integer NOT NULL DEFAULT 1
		);
	`);
	await client.exec(await readFile(new URL("../../../db/src/migrations/0024_fancy_iron_man.sql", import.meta.url), "utf8"));
});
after(() => client.close());
beforeEach(async () => {
	await client.exec("TRUNCATE ticket_orders, ticket_audit, ticket_rate_limits, ticket_settings, ticket_packages;");
	await db.insert(ticketSettings).values({ isSalesOpened: true });
	createPayment.mock.resetCalls();
});

function checkout(packageName: "VIP" | "Silver" = "VIP", requestKey = randomUUID(), actor = buyer) {
	return startCheckout(actor, { requestKey, packageName, buyerName: "Nguyễn Gia Khánh", buyerPhone: "0901234567" });
}

const reservationConflict = { code: "CONFLICT", message: "vipReservationExists" };

test("one buyer cannot hold a second VIP reservation, and rejections are durably audited", async () => {
	const order = await checkout();
	await assert.rejects(checkout(), reservationConflict);
	await assert.rejects(checkout(), reservationConflict);
	assert.equal((await db.select().from(ticketOrders)).length, 1);
	assert.equal(createPayment.mock.callCount(), 1);
	const entries = await db.select().from(ticketAudit);
	assert.equal(entries.length, 2);
	for (const entry of entries) {
		assert.equal(entry.actorId, buyer.id);
		assert.equal(entry.entityId, order.id);
		assert.equal(entry.action, "vipReservationBlocked");
		assert.equal(entry.outcome, "rejected");
	}
});

test("concurrent distinct checkout requests create only one held reservation", async () => {
	const results = await Promise.allSettled([checkout(), checkout(), checkout()]);
	assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
	for (const result of results) {
		if (result.status === "rejected") assert.equal(result.reason.message, "vipReservationExists");
	}
	assert.equal((await db.select().from(ticketOrders).where(eq(ticketOrders.reservation, "held"))).length, 1);
	assert.equal(createPayment.mock.callCount(), 1);
});

test("the same request key returns the existing order without another reservation or provider request", async () => {
	const requestKey = randomUUID();
	const results = await Promise.all([checkout("VIP", requestKey), checkout("VIP", requestKey)]);
	assert.equal(results[0].id, results[1].id);
	assert.equal((await db.select().from(ticketOrders)).length, 1);
	assert.equal((await db.select().from(ticketAudit)).length, 0);
	assert.equal(createPayment.mock.callCount(), 1);
	await assert.rejects(checkout("Silver", requestKey), { code: "CONFLICT", message: "requestChanged" });
});

test("another buyer and repeated normal orders can still check out", async () => {
	await checkout();
	await checkout("VIP", randomUUID(), otherBuyer);
	await checkout("Silver");
	await checkout("Silver");
	assert.equal((await db.select().from(ticketOrders)).length, 4);
});

for (const paymentStatus of ["creating", "processing", "review"] as const) {
	test(`an unexpired held ${paymentStatus} order still blocks another VIP reservation`, async () => {
		const order = await checkout();
		await db.update(ticketOrders).set({ paymentStatus }).where(eq(ticketOrders.id, order.id));
		await assert.rejects(checkout(), reservationConflict);
		assert.equal((await db.select().from(ticketOrders)).length, 1);
	});
}

for (const paymentStatus of ["cancelled", "failed", "paid"] as const) {
	test(`a ${paymentStatus} order with a released or consumed reservation allows another VIP order`, async () => {
		const order = await checkout();
		await db.update(ticketOrders).set({ paymentStatus, reservation: paymentStatus === "paid" ? "consumed" : "released" }).where(eq(ticketOrders.id, order.id));
		assert.notEqual((await checkout()).id, order.id);
	});
}

test("local expiry releases the old reservation before checking the buyer limit", async () => {
	const order = await checkout();
	await db.update(ticketOrders).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(ticketOrders.id, order.id));
	assert.notEqual((await checkout()).id, order.id);
	const [expired] = await db.select().from(ticketOrders).where(eq(ticketOrders.id, order.id));
	assert.ok(expired);
	assert.equal(expired.reservation, "released");
	assert.equal(expired.paymentStatus, "expired");
});

test("consumed VIP purchases continue to count toward inventory capacity", async () => {
	await db.update(ticketSettings).set({ vipCapacity: 1 });
	const order = await checkout();
	await db.update(ticketOrders).set({ paymentStatus: "paid", reservation: "consumed" }).where(eq(ticketOrders.id, order.id));
	await assert.rejects(checkout(), { code: "CONFLICT", message: "vipSoldOut" });
});

for (const field of ["buyerName", "buyerPhone"] as const) {
	for (const value of [undefined, null, "", " ", "\t\n"]) {
		test(`checkout rejects ${field} = ${JSON.stringify(value)}`, () => {
			const input = { requestKey: randomUUID(), packageName: "Silver", buyerName: "Nguyễn Gia Khánh", buyerPhone: "0901234567", [field]: value };
			const result = checkoutInput.safeParse(input);
			assert.equal(result.success, false);
			if (!result.success) assert.ok(result.error.issues.some(issue => issue.path[0] === field));
		});
	}
}

test("checkout trims and stores buyer details and passes them to the payment provider", async () => {
	const order = await startCheckout(buyer, { requestKey: randomUUID(), packageName: "Silver", buyerName: "  Nguyễn Gia Khánh  ", buyerPhone: "  +84 901 234 567  " });
	assert.equal(order.buyerName, "Nguyễn Gia Khánh");
	assert.equal(order.buyerPhone, "+84 901 234 567");
	assert.ok(createPayment.mock.calls[0]);
	assert.equal(createPayment.mock.calls[0].arguments[0].buyerName, order.buyerName);
	assert.equal(createPayment.mock.calls[0].arguments[0].buyerPhone, order.buyerPhone);
});

test("direct checkout calls reject blank contact details before creating an order or payment", async () => {
	await assert.rejects(startCheckout(buyer, { requestKey: randomUUID(), packageName: "Silver", buyerName: " ", buyerPhone: "0901234567" }));
	assert.equal((await db.select().from(ticketOrders)).length, 0);
	assert.equal(createPayment.mock.callCount(), 0);
});

test("database constraints reject missing or blank buyer details independently of the API", async () => {
	const order = await checkout("Silver");
	for (const column of ["buyer_name", "buyer_phone"]) {
		for (const value of [null, "", " ", "\t\n"]) {
			await assert.rejects(client.query(`UPDATE ticket_orders SET ${column} = $1 WHERE id = $2`, [value, order.id]));
		}
	}
});

test("migration blocks incomplete legacy orders and preserves corrected contact details", async () => {
	const legacy = new PGlite();
	try {
		const migration = await readFile(new URL("../../../db/src/migrations/0024_fancy_iron_man.sql", import.meta.url), "utf8");
		await legacy.exec("CREATE TABLE ticket_orders (buyer_name text, buyer_phone text);");
		for (const [name, phone] of [[null, "0901234567"], ["Nguyễn Gia Khánh", null], [" ", "0901234567"], ["Nguyễn Gia Khánh", "\t"]]) {
			await legacy.query("INSERT INTO ticket_orders VALUES ($1, $2)", [name, phone]);
			await assert.rejects(legacy.exec(migration), /Correct missing or blank buyer names and phone numbers/);
			await legacy.exec("DELETE FROM ticket_orders;");
		}
		await legacy.query("INSERT INTO ticket_orders VALUES ($1, $2)", ["Nguyễn Gia Khánh", "0901234567"]);
		await legacy.exec(migration);
		const result = await legacy.query("SELECT buyer_name, buyer_phone FROM ticket_orders");
		assert.deepEqual(result.rows, [{ buyer_name: "Nguyễn Gia Khánh", buyer_phone: "0901234567" }]);
	} finally {
		await legacy.close();
	}
});
