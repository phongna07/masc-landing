import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, mock, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { APIError } from "@payos/node";
import type { Context } from "../context";
import { admissionTickets, ticketEmailJobs, ticketPromos, ticketAudit, ticketOrders, ticketSettings } from "@masc-landing/db/schema/tickets";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

// Run the real checkout and inventory SQL against isolated PostgreSQL. Only the
// external database connection and payment provider are replaced; no secrets or
// configured database are used. PGlite serializes transactions on one connection.
const client = new PGlite();
const db = drizzle(client);
const buyer = { id: "buyer", email: "buyer@example.com" };
const otherBuyer = { id: "other-buyer", email: "other@example.com" };
let creationFailure: Error | null = null;
let providerUnavailable = false;
const createPayment = mock.fn(async (input: { orderCode: number; amount: number; buyerName: string; buyerPhone: string }) => {
	if (creationFailure) throw creationFailure;
	return {
		orderCode: input.orderCode, amount: input.amount, currency: "VND",
		paymentLinkId: String(input.orderCode), checkoutUrl: `https://pay.payos.vn/web/${input.orderCode}`,
	};
});
const getPayment = mock.fn(async (orderCode: number) => {
	const [order] = await db.select().from(ticketOrders).where(eq(ticketOrders.providerOrderCode, orderCode));
	return statusFor(order!);
});
const provider = mock.fn(() => {
	if (providerUnavailable) throw new Error("PayOS must not be called");
	return { paymentRequests: { create: createPayment, get: getPayment } };
});

mock.module("@masc-landing/db", { namedExports: { db } });
mock.module("@masc-landing/db/ticket-transaction", { namedExports: {
	ticketTransaction: (work: Parameters<typeof db.transaction>[0]) => db.transaction(work),
} });
mock.module(new URL("./payos.ts", import.meta.url).href, { namedExports: {
	payos: provider,
	orderReturnUrl: (id: string) => `https://example.com/tickets/orders/${id}`,
	checkoutUrl: (id: string) => `https://pay.payos.vn/web/${id}`,
	validCheckoutUrl: (url: string) => url.startsWith("https://pay.payos.vn/web/"),
} });
mock.module("@masc-landing/env/server", { namedExports: { env: {} } });
const { checkPromo, listPromos, promoInput, savePromo } = await import("./promos");
const { ticketsRouter } = await import("../routers/tickets");
const { checkoutInput, startCheckout, applyProviderStatus, reconcileOrder, runReconciliation, resolveLatePayment } = await import("./payments");

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
			snapshot jsonb NOT NULL CONSTRAINT ticket_order_snapshot_shape CHECK ((snapshot->>'totalPrice')::integer > 0), buyer_email text NOT NULL, buyer_name text, buyer_phone text,
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
		CREATE TABLE admission_tickets (
			id text PRIMARY KEY, source text NOT NULL, category text NOT NULL, order_id text, batch_id text, sales_log_id text, owner_id text,
			ordinal integer NOT NULL, code text NOT NULL UNIQUE, validity text NOT NULL DEFAULT 'valid', benefits jsonb NOT NULL DEFAULT '[]',
			recipient_name text, recipient_phone text, recipient_email text, accepted_count integer NOT NULL DEFAULT 0,
			credential_version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id, ordinal)
		);
		CREATE TABLE ticket_sales_logs (id text PRIMARY KEY, category text NOT NULL, quantity integer NOT NULL);
		CREATE TABLE ticket_credentials (code_hash text PRIMARY KEY, ticket_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
		CREATE TABLE ticket_email_jobs (
			id text PRIMARY KEY, dedupe_key text NOT NULL UNIQUE, order_id text, ticket_id text, to_address text NOT NULL,
			locale text NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
			next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, last_error text, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE ticket_payment_events (
			id text PRIMARY KEY, event_key text NOT NULL UNIQUE, order_id text, provider_order_code bigint, payment_link_id text,
			reference text, amount integer, currency text, kind text NOT NULL, outcome text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE admin_emails (email text PRIMARY KEY, role text NOT NULL);
		CREATE TABLE admin_activity_logs (
			id text PRIMARY KEY, actor_user_id text NOT NULL, actor_name text NOT NULL, actor_email text NOT NULL,
			actor_role text NOT NULL, procedure_path text NOT NULL, procedure_type text NOT NULL,
			input jsonb, outcome text NOT NULL, error_code text, created_at timestamp NOT NULL DEFAULT now()
		);
	`);
	await client.exec(await readFile(new URL("../../../db/src/migrations/0024_fancy_iron_man.sql", import.meta.url), "utf8"));
	await client.exec(await readFile(new URL("../../../db/src/migrations/0026_little_marvel_apes.sql", import.meta.url), "utf8"));
	await client.exec(await readFile(new URL("../../../db/src/migrations/0027_marvelous_franklin_storm.sql", import.meta.url), "utf8"));
});
after(() => client.close());
beforeEach(async () => {
	await client.exec("TRUNCATE ticket_sales_logs, ticket_orders, ticket_promos, ticket_audit, ticket_rate_limits, ticket_settings, ticket_packages, admission_tickets, ticket_credentials, ticket_email_jobs, ticket_payment_events, admin_emails, admin_activity_logs;");
	await db.insert(ticketSettings).values({ isSalesOpened: true });
	createPayment.mock.resetCalls();
	getPayment.mock.resetCalls();
	provider.mock.resetCalls();
	creationFailure = null;
	providerUnavailable = false;
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

const promoPrices = { Silver: 99000, Golden: 179000, Platinum: 259000, VIP: 149000 };
async function promo(overrides: Partial<Parameters<typeof savePromo>[0]> = {}) {
	return savePromo({ code: "MASC26", enabled: true, prices: promoPrices, totalLimit: null, perBuyerLimit: null, ...overrides }, "admin");
}
async function promoCheckout(code: { code: string; revision: string }, packageName: "Silver" | "Golden" | "Platinum" | "VIP" = "Silver", actor = buyer, requestKey = randomUUID()) {
	return startCheckout(actor, { requestKey, packageName, buyerName: "Nguyễn Gia Khánh", buyerPhone: "0901234567", promo: { code: code.code, revision: code.revision } });
}
function statusFor(order: typeof ticketOrders.$inferSelect, status = "PAID", paid = order.snapshot.totalPrice) {
	return { id: order.paymentLinkId ?? String(order.providerOrderCode), orderCode: order.providerOrderCode, amount: order.snapshot.totalPrice, amountPaid: paid, amountRemaining: order.snapshot.totalPrice - paid, status, currency: "VND", transactions: paid ? [{ reference: `bank:${order.id}`, amount: paid, currency: "VND" }] : [] };
}
function caller(email: string | null = buyer.email) {
	const now = new Date();
	const session = {
		user: { ...buyer, name: "Buyer", email: email ?? "", emailVerified: true, createdAt: now, updatedAt: now, image: null },
		session: { id: "session", userId: buyer.id, token: "test-token", expiresAt: new Date(Date.now() + 60000), createdAt: now, updatedAt: now, ipAddress: null, userAgent: null },
	};
	return ticketsRouter.createCaller({ auth: null, headers: new Headers(), getSession: async () => session, getFreshSession: async () => email ? session : null } satisfies Context);
}

test("promo endpoints require fresh buyer authentication and ticket admin access", async () => {
	await assert.rejects(caller(null).checkPromo({ code: "MASC26" }), { code: "UNAUTHORIZED" });
	for (const email of [null, buyer.email, "staff@example.com", "professional@example.com"]) {
		await client.query("INSERT INTO admin_emails VALUES ('staff@example.com', 'entrance-staff'), ('professional@example.com', 'professional') ON CONFLICT DO NOTHING");
		const api = caller(email);
		const code = email ? "FORBIDDEN" : "UNAUTHORIZED";
		await assert.rejects(api.promos(), { code });
		await assert.rejects(api.createPromo({ code: "MASC26", prices: promoPrices }), { code });
		await assert.rejects(api.updatePromo({ id: randomUUID(), revision: randomUUID(), code: "MASC26", prices: promoPrices }), { code });
	}
	await client.query("INSERT INTO admin_emails VALUES ('root@example.com', 'root')");
	const created = await caller("root@example.com").createPromo({ code: "  masc26  ", prices: promoPrices });
	assert.equal(created.code, "MASC26");
	assert.equal((await caller("root@example.com").promos()).length, 1);
	assert.equal((await caller().checkPromo({ code: "masc26" })).code, "MASC26");
});

test("promo normalization, uniqueness, prices, limits, and audit metadata persist", async () => {
	const created = await promo({ code: "  masc26  " });
	assert.equal(created.code, "MASC26");
	assert.deepEqual(created.prices, promoPrices);
	assert.equal(created.totalLimit, null);
	assert.equal(created.perBuyerLimit, null);
	await assert.rejects(promo({ code: "masc26" }), { message: "promoDuplicate" });
	const [entry] = await db.select().from(ticketAudit);
	assert.deepEqual(entry?.metadata, { promoCode: created.code, revision: created.revision, prices: promoPrices, totalLimit: null, perBuyerLimit: null, enabled: true });
	for (const code of ["", "MASC 26", "é", "A".repeat(65)]) assert.equal(promoInput.safeParse({ code, prices: promoPrices }).success, false);
	for (const price of [-1, 1, 999, 1000.5, 1000000001]) assert.equal(promoInput.safeParse({ code: "OK", prices: { ...promoPrices, Silver: price } }).success, false);
	for (const price of [0, 1000, 1000000000]) assert.equal(promoInput.safeParse({ code: "OK", prices: { ...promoPrices, Silver: price } }).success, true);
	await assert.rejects(db.update(ticketPromos).set({ prices: { ...promoPrices, VIP: -1 } }).where(eq(ticketPromos.id, created.id)));
});

test("checking a promo does not reserve uses and returns all four prices", async () => {
	await promo({ totalLimit: 1, perBuyerLimit: 1 });
	const checked = await checkPromo("masc26", buyer.id);
	assert.deepEqual(checked.prices, promoPrices);
	assert.equal((await db.select().from(ticketOrders)).length, 0);
	const [record] = await listPromos();
	assert.equal(record?.held, 0);
	assert.equal(record?.consumed, 0);
});

test("disabled, missing and revised codes reject checkout before creating an order", async () => {
	const original = await promo();
	await assert.rejects(checkPromo("MISSING", buyer.id), { message: "promoUnavailable" });
	const updated = await savePromo({ ...original, prices: { ...promoPrices, Silver: 1000 } }, "admin", true);
	await assert.rejects(promoCheckout(original), { message: "promoChanged" });
	await savePromo({ ...updated, enabled: false }, "admin", true);
	await assert.rejects(checkPromo(updated.code, buyer.id), { message: "promoUnavailable" });
	await assert.rejects(promoCheckout(updated), { message: "promoUnavailable" });
	assert.equal((await db.select().from(ticketOrders)).length, 0);
	assert.equal(createPayment.mock.callCount(), 0);
});

test("all four packages use promo prices and retain global original prices", async () => {
	const created = await promo();
	const originals = { Silver: 129000, Golden: 249000, Platinum: 349000, VIP: 199000 };
	for (const name of ["Silver", "Golden", "Platinum", "VIP"] as const) {
		const order = await promoCheckout(created, name);
		assert.equal(order.snapshot.totalPrice, promoPrices[name]);
		assert.equal(order.snapshot.promo?.originalPrice, originals[name]);
		assert.equal(createPayment.mock.calls.at(-1)?.arguments[0].amount, promoPrices[name]);
	}
});

test("renaming, repricing and disabling retain existing orders and request idempotency", async () => {
	const original = await promo({ totalLimit: 1 });
	const requestKey = randomUUID();
	const order = await promoCheckout(original, "Golden", buyer, requestKey);
	await savePromo({ ...original, code: "RENAMED", enabled: false, prices: { ...promoPrices, Golden: 0 } }, "admin", true);
	const retried = await promoCheckout(original, "Golden", buyer, requestKey);
	assert.equal(retried.id, order.id);
	assert.equal(retried.snapshot.promo?.code, "MASC26");
	assert.equal(retried.snapshot.totalPrice, promoPrices.Golden);
	assert.equal(createPayment.mock.callCount(), 1);
	await assert.rejects(startCheckout(buyer, { requestKey, packageName: "Golden", buyerName: "Buyer", buyerPhone: "123" }), { message: "requestChanged" });
	await applyProviderStatus(order.id, statusFor(order));
	assert.equal((await db.select().from(ticketOrders))[0]?.promoReservation, "consumed");
	assert.equal((await db.select().from(admissionTickets)).length, 2);
});

test("concurrent checkouts cannot exceed the final total promo use", async () => {
	const created = await promo({ totalLimit: 1 });
	const results = await Promise.allSettled([promoCheckout(created), promoCheckout(created, "Golden", otherBuyer), promoCheckout(created)]);
	assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
	assert.equal((await db.select().from(ticketOrders)).length, 1);
	assert.equal((await listPromos())[0]?.held, 1);
	await assert.rejects(checkPromo(created.code, buyer.id), { message: "promoLimitReached" });
});

test("per-buyer limits support multiple orders independently of the total cap", async () => {
	const created = await promo({ perBuyerLimit: 2 });
	await promoCheckout(created);
	await promoCheckout(created, "Golden");
	await assert.rejects(promoCheckout(created), { message: "promoBuyerLimitReached" });
	await promoCheckout(created, "Silver", otherBuyer);
	await assert.rejects(savePromo({ ...created, totalLimit: 2 }, "admin", true), { message: "promoLimitTooLow" });
	await assert.rejects(savePromo({ ...created, perBuyerLimit: 1 }, "admin", true), { message: "promoLimitTooLow" });
});

for (const status of ["CANCELLED", "FAILED", "EXPIRED"] as const) {
	test(`confirmed ${status} releases a promo use`, async () => {
		const created = await promo({ totalLimit: 1 });
		const order = await promoCheckout(created);
		await applyProviderStatus(order.id, statusFor(order, status, 0));
		assert.equal((await db.select().from(ticketOrders).where(eq(ticketOrders.id, order.id)))[0]?.promoReservation, "released");
		assert.notEqual((await promoCheckout(created)).id, order.id);
	});
}

test("local expiry releases uses and late-payment approval must reacquire capacity", async () => {
	const created = await promo({ totalLimit: 1, perBuyerLimit: 1 });
	const expired = await promoCheckout(created);
	await db.update(ticketOrders).set({ expiresAt: sql`now() - interval '1 second'` }).where(eq(ticketOrders.id, expired.id));
	const replacement = await promoCheckout(created, "Silver", otherBuyer);
	await assert.rejects(resolveLatePayment(expired.id, "admin", "Approve late payment"), { message: "promoLimitReached" });
	await applyProviderStatus(replacement.id, statusFor(replacement, "CANCELLED", 0));
	await resolveLatePayment(expired.id, "admin", "Approve late payment");
	assert.equal((await db.select().from(ticketOrders).where(eq(ticketOrders.id, expired.id)))[0]?.promoReservation, "consumed");
});

test("definitive creation failures release uses while uncertain failures hold them", async () => {
	const created = await promo({ totalLimit: 1 });
	creationFailure = new APIError(400, {}, "Rejected", new Headers());
	const failed = await promoCheckout(created);
	assert.equal(failed.promoReservation, "released");
	creationFailure = new Error("network timeout");
	const uncertain = await promoCheckout(created);
	assert.equal(uncertain.promoReservation, "held");
	await assert.rejects(promoCheckout(created), { message: "promoLimitReached" });
});

for (const [name, quantity] of [["Silver", 1], ["Golden", 2], ["Platinum", 3], ["VIP", 1]] as const) {
	test(`free ${name} issues ${quantity} tickets and one email without PayOS`, async () => {
		const created = await promo({ prices: { Silver: 0, Golden: 0, Platinum: 0, VIP: 0 }, perBuyerLimit: 1 });
		providerUnavailable = true;
		const requestKey = randomUUID();
		const order = await promoCheckout(created, name, buyer, requestKey);
		const retried = await promoCheckout(created, name, buyer, requestKey);
		assert.equal(retried.id, order.id);
		assert.equal(order.paymentStatus, "paid");
		assert.equal(order.fulfillmentStatus, "issued");
		assert.equal(order.snapshot.totalPrice, 0);
		assert.equal(order.settledAmount, 0);
		assert.equal(order.promoReservation, "consumed");
		assert.equal(order.reservation, name === "VIP" ? "consumed" : "none");
		assert.equal(order.checkoutUrl, null);
		assert.ok(order.paidAt);
		const issued = await db.select().from(admissionTickets);
		assert.equal(issued.length, quantity);
		assert.ok(issued.every(ticket => ticket.source === "purchased" && ticket.ownerId === buyer.id));
		assert.deepEqual(issued[0]?.benefits, name === "VIP" ? ["networkingLunch"] : []);
		assert.equal((await db.select().from(ticketEmailJobs)).length, 1);
		await reconcileOrder(order.id, true);
		assert.equal(await runReconciliation(), 0);
		await applyProviderStatus(order.id, { invalid: true });
		assert.equal((await db.select().from(ticketOrders))[0]?.paymentStatus, "paid");
		assert.equal(provider.mock.callCount(), 0);
		assert.equal(createPayment.mock.callCount(), 0);
		assert.equal(getPayment.mock.callCount(), 0);
		await assert.rejects(promoCheckout(created, name), { message: "promoBuyerLimitReached" });
	});
}

test("free checkout respects closed sales and VIP inventory", async () => {
	const created = await promo({ prices: { ...promoPrices, VIP: 0 } });
	await db.update(ticketSettings).set({ vipCapacity: 1 });
	await promoCheckout(created, "VIP");
	await assert.rejects(promoCheckout(created, "VIP", otherBuyer), { message: "vipSoldOut" });
	await db.update(ticketSettings).set({ isSalesOpened: false });
	await assert.rejects(promoCheckout(created), { message: "salesClosed" });
});

test("free checkout rolls back the order, use, credentials and email if issuance fails", async () => {
	const created = await promo({ prices: { ...promoPrices, Platinum: 0 }, totalLimit: 1 });
	await client.exec("ALTER TABLE admission_tickets ADD CONSTRAINT test_issue_failure CHECK (ordinal < 2)");
	try {
		await assert.rejects(promoCheckout(created, "Platinum"));
		assert.equal((await db.select().from(ticketOrders)).length, 0);
		assert.equal((await db.select().from(admissionTickets)).length, 0);
		assert.equal((await db.select().from(ticketEmailJobs)).length, 0);
		assert.equal((await client.query("SELECT * FROM ticket_credentials")).rows.length, 0);
		assert.equal((await listPromos())[0]?.held, 0);
	} finally {
		await client.exec("ALTER TABLE admission_tickets DROP CONSTRAINT test_issue_failure");
	}
	await promoCheckout(created, "Platinum");
});

test("ordinary orders use global prices and cannot become zero-total without a promo", async () => {
	const order = await checkout("Silver");
	assert.equal(order.snapshot.totalPrice, 129000);
	assert.equal(order.promoId, null);
	await assert.rejects(db.update(ticketOrders).set({ snapshot: { ...order.snapshot, totalPrice: 0 } }).where(eq(ticketOrders.id, order.id)));
});

test("promo migration preserves legacy orders and defaults their usage to none", async () => {
	const legacy = new PGlite();
	try {
		await legacy.exec(`CREATE TABLE ticket_orders (
			id text PRIMARY KEY, buyer_id text NOT NULL, snapshot jsonb NOT NULL,
			CONSTRAINT ticket_order_snapshot_shape CHECK ((snapshot->>'totalPrice')::integer > 0)
		); CREATE TABLE ticket_audit (id text PRIMARY KEY);`);
		const snapshot = { packageName: "Golden", quantity: 2, category: "normal", currency: "VND", totalPrice: 249000, benefits: [] };
		await legacy.query("INSERT INTO ticket_orders VALUES ('legacy', 'buyer', $1)", [JSON.stringify(snapshot)]);
		await legacy.exec(await readFile(new URL("../../../db/src/migrations/0026_little_marvel_apes.sql", import.meta.url), "utf8"));
		assert.deepEqual((await legacy.query("SELECT snapshot, promo_id, promo_reservation FROM ticket_orders")).rows, [{ snapshot, promo_id: null, promo_reservation: "none" }]);
		await assert.rejects(legacy.query("UPDATE ticket_orders SET snapshot = $1", [JSON.stringify({ ...snapshot, totalPrice: 0 })]));
	} finally { await legacy.close(); }
});

test("admin revisions prevent overwriting a newer promo configuration", async () => {
	const original = await promo();
	const updated = await savePromo({ ...original, totalLimit: 3 }, "admin", true);
	await assert.rejects(savePromo({ ...original, totalLimit: 10 }, "admin", true), { message: "promoChanged" });
	assert.equal((await listPromos())[0]?.revision, updated.revision);
});

test("paid promo checkout validates provider configuration before committing an order or use", async () => {
	const created = await promo({ totalLimit: 1 });
	providerUnavailable = true;
	await assert.rejects(promoCheckout(created));
	assert.equal((await db.select().from(ticketOrders)).length, 0);
	assert.equal((await listPromos())[0]?.held, 0);
});


test("referral codes are optional, normalized, immutable on retry, and never discount prices", async () => {
	const input = { requestKey: randomUUID(), packageName: "Golden" as const, buyerName: "Buyer", buyerPhone: "123", referralCode: "  sale_team-1  " };
	const order = await startCheckout(buyer, input);
	assert.equal(order.referralCode, "SALE_TEAM-1");
	assert.equal(order.snapshot.totalPrice, 249000);
	assert.equal(order.snapshot.promo, undefined);
	assert.equal((await startCheckout(buyer, { ...input, referralCode: "SALE_TEAM-1" })).id, order.id);
	assert.equal(createPayment.mock.callCount(), 1);
	for (const referralCode of ["OTHER", ""]) await assert.rejects(startCheckout(buyer, { ...input, referralCode }), { message: "requestChanged" });
	assert.equal((await checkout("Silver")).referralCode, null);
	assert.equal((await startCheckout(otherBuyer, { ...input, requestKey: randomUUID(), referralCode: "  " })).referralCode, null);
	for (const referralCode of ["A".repeat(65), "bad code", "bad?code", "bad\ncode"]) assert.equal(checkoutInput.safeParse({ ...input, referralCode }).success, false);
	await assert.rejects(db.update(ticketOrders).set({ referralCode: "lowercase" }).where(eq(ticketOrders.id, order.id)));
});

test("referrals coexist with promos, filter orders exactly, and count all matching pages", async () => {
	await client.query("INSERT INTO admin_emails VALUES ('root@example.com', 'root')");
	const api = caller("root@example.com");
	const checked = await promo({ prices: { ...promoPrices, Golden: 0 } });
	const paid = await startCheckout(buyer, { requestKey: randomUUID(), packageName: "Golden", buyerName: "Buyer", buyerPhone: "123", referralCode: "sale", promo: checked });
	assert.equal(paid.referralCode, "SALE");
	assert.equal(paid.snapshot.promo?.code, checked.code);
	assert.equal(paid.snapshot.totalPrice, 0);
	const pending = await checkout("Silver");
	// Add history beyond one page without invoking a payment provider.
	for (let index = 0; index < 21; index++) await db.insert(ticketOrders).values({
		...pending, id: randomUUID(), requestKey: randomUUID(), providerOrderCode: pending.providerOrderCode + index + 1,
		paymentLinkId: null, checkoutUrl: null, referralCode: "SALE",
	});
	await db.update(ticketOrders).set({ referralCode: "SALE_OTHER" }).where(eq(ticketOrders.id, pending.id));
	const usage = await api.referrals({});
	assert.deepEqual(usage, [{ code: "SALE", orders: 22, paidOrders: 1, issuedTickets: 2 }, { code: "SALE_OTHER", orders: 1, paidOrders: 0, issuedTickets: 0 }]);
	assert.deepEqual(await api.referrals({ status: "paid" }), [{ code: "SALE", orders: 1, paidOrders: 1, issuedTickets: 2 }]);
	assert.deepEqual(await api.referrals({ category: "vip" }), []);
	assert.deepEqual(await api.referrals({ emailStatus: "pending", validity: "valid" }), [{ code: "SALE", orders: 1, paidOrders: 1, issuedTickets: 2 }]);
	const firstPage = await api.orders({ referralCode: "sale" });
	assert.equal(firstPage.total, 22);
	assert.equal(firstPage.items.length, 20);
	assert.ok(firstPage.items.every(order => order.referralCode === "SALE"));
	assert.equal((await api.orders({ referralCode: "SALE", page: 1 })).items.length, 2);
	assert.equal((await api.orders({ referralCode: "SALE", status: "paid" })).total, 1);
	assert.equal((await api.orders({ referralCode: "MISSING" })).total, 0);
});

test("referral reporting is restricted to ticket admins", async () => {
	await client.query("INSERT INTO admin_emails VALUES ('staff@example.com', 'entrance-staff'), ('professional@example.com', 'professional')");
	for (const email of [null, buyer.email, "staff@example.com", "professional@example.com"]) {
		const api = caller(email);
		const code = email ? "FORBIDDEN" : "UNAUTHORIZED";
		await assert.rejects(api.referrals({}), { code });
		await assert.rejects(api.orders({ referralCode: "SALE" }), { code });
	}
});

test("referral migration preserves existing orders without assigning a code", async () => {
	const legacy = new PGlite();
	try {
		await legacy.exec("CREATE TABLE ticket_orders (id text PRIMARY KEY); INSERT INTO ticket_orders VALUES ('legacy');");
		await legacy.exec(await readFile(new URL("../../../db/src/migrations/0027_marvelous_franklin_storm.sql", import.meta.url), "utf8"));
		assert.deepEqual((await legacy.query("SELECT * FROM ticket_orders")).rows, [{ id: "legacy", referral_code: null }]);
	} finally { await legacy.close(); }
});
