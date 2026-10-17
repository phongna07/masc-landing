import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ticketOrders, ticketPaymentEvents } from "@masc-landing/db/schema/tickets";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { reconciliationClaim, reconciliationCompletion, reconciliationDue, reconciliationOwner, reconciliationRequest } from "./reconciliation";

// Execute the production SQL in isolated PostgreSQL, without a configured Neon
// database or payment provider. Interleave receipts and workers deterministically.
const client = new PGlite();
const db = drizzle(client);
const fields = {
	id: ticketOrders.id,
	reconcileLeaseId: ticketOrders.reconcileLeaseId,
	reconcileLeaseUntil: ticketOrders.reconcileLeaseUntil,
	reconcileRequestId: ticketOrders.reconcileRequestId,
	reconcileAttempts: ticketOrders.reconcileAttempts,
	nextReconcileAt: ticketOrders.nextReconcileAt,
	fulfillmentStatus: ticketOrders.fulfillmentStatus,
	issue: ticketOrders.issue,
};
type ClaimedOrder = NonNullable<Awaited<ReturnType<typeof claim>>>;

before(async () => {
	await client.exec(`
		CREATE TABLE ticket_orders (
			id text PRIMARY KEY,
			snapshot jsonb NOT NULL DEFAULT '{"totalPrice":1000}',
			reconcile_lease_id text,
			reconcile_lease_until timestamptz,
			reconcile_request_id text,
			reconcile_attempts integer NOT NULL DEFAULT 0,
			next_reconcile_at timestamptz NOT NULL DEFAULT now(),
			last_verified_at timestamptz,
			created_at timestamptz NOT NULL DEFAULT now(),
			payment_status text NOT NULL DEFAULT 'pending',
			fulfillment_status text NOT NULL DEFAULT 'pending',
			issue text
		);
		CREATE TABLE ticket_payment_events (
			id text PRIMARY KEY,
			event_key text UNIQUE NOT NULL,
			order_id text,
			provider_order_code bigint,
			payment_link_id text,
			reference text,
			amount integer,
			currency text,
			kind text NOT NULL,
			outcome text NOT NULL,
			created_at timestamptz NOT NULL DEFAULT now()
		);
	`);
});
after(() => client.close());
beforeEach(async () => {
	await client.exec("TRUNCATE ticket_orders, ticket_payment_events; INSERT INTO ticket_orders (id) VALUES ('order');");
});

async function claim(force = false) {
	const query = reconciliationClaim("order", force);
	const [order] = await db.update(ticketOrders).set(query.set).where(query.where).returning(fields);
	return order;
}

async function complete(order: ClaimedOrder, failed = false) {
	const query = reconciliationCompletion(order, failed);
	return db.update(ticketOrders).set(query.set).where(query.where).returning(fields);
}

async function notify() {
	const request = reconciliationRequest();
	await db.update(ticketOrders).set(request).where(eq(ticketOrders.id, "order"));
	return request.reconcileRequestId;
}

async function state() {
	const [order] = await db.select(fields).from(ticketOrders);
	assert.ok(order);
	return order;
}

async function schedule() {
	const [result] = await db.select({
		due: sql<boolean>`${ticketOrders.nextReconcileAt} <= now()`,
		seconds: sql<number>`extract(epoch from (${ticketOrders.nextReconcileAt} - now()))::float`,
	}).from(ticketOrders);
	assert.ok(result);
	return result;
}

for (const failed of [false, true]) {
	test(`a notification during ${failed ? "a failed" : "a successful"} lookup remains immediately due`, async () => {
		await db.update(ticketOrders).set({ reconcileAttempts: 7 }).where(eq(ticketOrders.id, "order"));
		const order = await claim();
		assert.ok(order);
		const requestId = await notify();
		assert.equal(await claim(), undefined);
		assert.equal(await claim(true), undefined);
		// Reproduce a receipt predating applyProviderStatus's lastVerifiedAt.
		await db.update(ticketOrders).set({ lastVerifiedAt: sql`now()` }).where(eq(ticketOrders.id, "order"));
		await complete(order, failed);
		const current = await state();
		assert.equal(current.reconcileRequestId, requestId);
		assert.equal(current.reconcileLeaseId, null);
		assert.equal(current.reconcileLeaseUntil, null);
		assert.equal(current.reconcileAttempts, 8);
		assert.equal((await schedule()).due, true);
		// Preserve the ten-second successful-lookup throttle, then recover without
		// requiring a duplicate delivery to wake the order again.
		assert.equal(await claim(), undefined);
		await db.update(ticketOrders).set({ lastVerifiedAt: sql`now() - interval '11 seconds'` }).where(eq(ticketOrders.id, "order"));
		const retry = await claim();
		assert.ok(retry);
		assert.equal(retry.reconcileRequestId, requestId);
		await complete(retry);
		assert.equal((await state()).reconcileRequestId, null);
		assert.equal((await schedule()).due, false);
	});
}

test("only the marker captured at claim can be acknowledged", async () => {
	const first = await notify();
	const order = await claim();
	assert.ok(order);
	assert.equal(order.reconcileRequestId, first);
	await notify();
	const latest = await notify();
	await complete(order);
	assert.equal((await state()).reconcileRequestId, latest);
	assert.equal((await schedule()).due, true);
});

test("a successful lookup acknowledges its unchanged notification and uses normal backoff", async () => {
	const requestId = await notify();
	const order = await claim();
	assert.ok(order);
	assert.equal(order.reconcileRequestId, requestId);
	await complete(order);
	assert.equal((await state()).reconcileRequestId, null);
	const timing = await schedule();
	assert.equal(timing.due, false);
	assert.ok(timing.seconds > 28 && timing.seconds <= 30);
});

test("failed unchanged work keeps its marker and capped backoff on an old terminal order", async () => {
	await db.update(ticketOrders).set({ createdAt: sql`now() - interval '100 days'`, paymentStatus: "paid", fulfillmentStatus: "issued", reconcileAttempts: 9 }).where(eq(ticketOrders.id, "order"));
	const requestId = await notify();
	const order = await claim();
	assert.ok(order);
	await complete(order, true);
	assert.equal((await state()).reconcileRequestId, requestId);
	const timing = await schedule();
	assert.equal(timing.due, false);
	assert.ok(timing.seconds > 3598 && timing.seconds <= 3600);
	await db.update(ticketOrders).set({ nextReconcileAt: sql`now()`, lastVerifiedAt: sql`now()` }).where(eq(ticketOrders.id, "order"));
	assert.equal((await db.select({ id: ticketOrders.id }).from(ticketOrders).where(reconciliationDue())).length, 1);
});

test("a marker survives a crashed worker and expired lease on an old terminal order", async () => {
	await db.update(ticketOrders).set({ createdAt: sql`now() - interval '100 days'`, paymentStatus: "paid", fulfillmentStatus: "issued" }).where(eq(ticketOrders.id, "order"));
	const original = await claim();
	assert.ok(original);
	const requestId = await notify();
	await db.update(ticketOrders).set({ lastVerifiedAt: sql`now()`, reconcileLeaseUntil: sql`now() - interval '1 second'` }).where(eq(ticketOrders.id, "order"));
	assert.equal((await db.select({ id: ticketOrders.id }).from(ticketOrders).where(reconciliationDue())).length, 1);
	const replacement = await claim(true);
	assert.ok(replacement);
	assert.equal(replacement.reconcileRequestId, requestId);
	await complete(replacement);
	assert.equal((await state()).reconcileRequestId, null);
	assert.equal((await db.select({ id: ticketOrders.id }).from(ticketOrders).where(reconciliationDue())).length, 0);
});

test("a replaced worker cannot clear the new lease, acknowledge work, change retries, or report failure", async () => {
	const original = await claim();
	assert.ok(original);
	await notify();
	await db.update(ticketOrders).set({ reconcileLeaseUntil: sql`now() - interval '1 second'` }).where(eq(ticketOrders.id, "order"));
	const replacement = await claim();
	assert.ok(replacement?.reconcileLeaseId);
	assert.notEqual(original.reconcileLeaseId, replacement.reconcileLeaseId);
	const current = await state();
	assert.deepEqual(await complete(original), []);
	assert.deepEqual(await complete(original, true), []);
	assert.ok(original.reconcileLeaseId);
	assert.deepEqual(await db.update(ticketOrders).set({ issue: "verificationUnavailable" }).where(reconciliationOwner(original.id, original.reconcileLeaseId)).returning({ id: ticketOrders.id }), []);
	assert.deepEqual(await state(), current);
	await complete(replacement);
	const completed = await state();
	assert.deepEqual(await complete(original), []);
	assert.deepEqual(await state(), completed);
});

test("routine polling without notifications still backs off", async () => {
	const order = await claim();
	assert.ok(order);
	await complete(order);
	assert.equal((await state()).reconcileRequestId, null);
	assert.equal(await claim(), undefined);
	assert.equal((await schedule()).due, false);
});

test("duplicate receipts do not create new work or reset backoff", async () => {
	async function receive() {
		return db.transaction(async tx => {
			const [event] = await tx.insert(ticketPaymentEvents).values({ id: "receipt", eventKey: "webhook:link:reference", orderId: "order", kind: "webhook", outcome: "received" }).onConflictDoNothing().returning({ id: ticketPaymentEvents.id });
			if (event) await tx.update(ticketOrders).set(reconciliationRequest()).where(eq(ticketOrders.id, "order"));
		});
	}
	await receive();
	const order = await claim();
	assert.ok(order?.reconcileRequestId);
	const claimed = await state();
	await receive();
	assert.deepEqual(await state(), claimed);
	await complete(order);
	const completed = await state();
	await receive();
	assert.deepEqual(await state(), completed);
	assert.equal(await claim(), undefined);
});
