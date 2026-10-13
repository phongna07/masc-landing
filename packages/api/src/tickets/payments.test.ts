import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
const createPayment = mock.fn(async (input: { orderCode: number; amount: number }) => ({
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
const { startCheckout } = await import("./payments");

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
});
after(() => client.close());
beforeEach(async () => {
	await client.exec("TRUNCATE ticket_orders, ticket_audit, ticket_rate_limits, ticket_settings, ticket_packages;");
	await db.insert(ticketSettings).values({ isSalesOpened: true });
	createPayment.mock.resetCalls();
});

function checkout(packageName: "VIP" | "Silver" = "VIP", requestKey = randomUUID(), actor = buyer) {
	return startCheckout(actor, { requestKey, packageName, locale: "en" });
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
