import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { after, before, beforeEach, mock, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { admissionTickets, salesLogs, salesLogEmailAttempts, ticketSettings, ticketEmailJobs, ticketOrders, ticketCredentials } from "@masc-landing/db/schema/tickets";
import { adminEmails } from "@masc-landing/db/schema/admin-emails";
import type { Context } from "../context";
import { canAccessAdminArea, adminAreas } from "../admin-roles";
import type { SalesActor } from "./sales-logs";

const client = new PGlite();
const db = drizzle(client);
let mailFailure = false;
let waitForMail: (() => Promise<void>) | null = null;
const sendMail = mock.fn(async (_mail: { to: string; subject: string; text: string; html: string; attachments?: unknown[] }) => {
	if (waitForMail) await waitForMail();
	if (mailFailure) throw new Error("PRIVATE_PROVIDER_ERROR");
});
mock.module("@masc-landing/db", { namedExports: { db } });
mock.module("@masc-landing/db/ticket-transaction", { namedExports: { ticketTransaction: (work: Parameters<typeof db.transaction>[0]) => db.transaction(work) } });
mock.module("@masc-landing/env/server", { namedExports: { env: { MAIL_USERNAME: "test@example.com" } } });
mock.module(new URL("../email/send-mail.ts", import.meta.url).href, { namedExports: { sendMail } });
mock.module(new URL("./artwork.ts", import.meta.url).href, { namedExports: {
	ticketPng: async () => Buffer.from("test-ticket-image"),
	escapeXml: (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!),
} });
const { salesLogsRouter } = await import("../routers/sales-logs");
const { ticketsRouter } = await import("../routers/tickets");
const { createSalesLog, createSalesLogInput, accessibleSalesLog, salesLogPageInput } = await import("./sales-logs");
const { sendSalesLogEmail } = await import("./sales-log-email");
const { accessibleTicket, getTicketConfig } = await import("./core");
const { startCheckout } = await import("./payments");
const { updateSettings } = await import("./management");
const { confirmCheckIn, lookupTicket } = await import("./check-in");
const actor: SalesActor = { id: "sales", name: "Sales One", email: "sales@example.com", isRoot: false };
const other: SalesActor = { id: "other", name: "Sales Two", email: "other@example.com", isRoot: false };
const root: SalesActor = { id: "root", name: "Root", email: "root@example.com", isRoot: true };
const input = (overrides = {}) => createSalesLogInput.parse({ requestKey: randomUUID(), buyerName: "Nguyễn An", buyerEmail: "BUYER@example.com", buyerPhone: "0901234567", category: "normal", quantity: 2, amountReceived: 123456, ...overrides });

before(async () => {
	await client.exec(`
		CREATE TYPE admin_role AS ENUM ('root', 'professional');
		CREATE TABLE admin_emails (email text PRIMARY KEY, role admin_role NOT NULL);
		CREATE TABLE "user" (id text PRIMARY KEY, name text, email text);
		INSERT INTO "user" VALUES ('buyer', 'Buyer', 'buyer@example.com');
		CREATE TABLE admin_activity_logs (id text PRIMARY KEY, actor_user_id text NOT NULL, actor_name text NOT NULL, actor_email text NOT NULL, actor_role text NOT NULL, procedure_path text NOT NULL, procedure_type text NOT NULL, input jsonb, outcome text NOT NULL, error_code text, created_at timestamp DEFAULT now());
	`);
	// Validate the actual generated migration against the preceding ticket schema.
	const directory = new URL("../../../db/src/migrations/", import.meta.url);
	for (const filename of (await readdir(directory)).filter(name => /^00(1[89]|2\d)_.*\.sql$/.test(name)).sort()) {
		if (filename.startsWith("0028_")) {
			await client.exec(`
				INSERT INTO ticket_gift_batches (id, request_key, category, quantity, title, created_by) VALUES ('legacy-gift', 'legacy-key', 'normal', 1, 'Legacy', 'root');
				INSERT INTO ticket_orders (id, buyer_id, request_key, provider_order_code, snapshot, buyer_email, buyer_name, buyer_phone, locale, expires_at)
				VALUES ('legacy-order', 'buyer', 'legacy-key', 987654, '{"packageName":"Silver","category":"normal","quantity":1,"currency":"VND","totalPrice":129000,"benefits":[]}', 'buyer@example.com', 'Buyer', '0900000000', 'vi', now());
				INSERT INTO admission_tickets (id, source, category, batch_id, order_id, owner_id, ordinal, code) VALUES
				('legacy-gift-ticket', 'gifted', 'normal', 'legacy-gift', NULL, NULL, 1, 'AAAAAAAAAAAAAAAAAAAA'),
				('legacy-purchase-ticket', 'purchased', 'normal', NULL, 'legacy-order', 'buyer', 1, 'BBBBBBBBBBBBBBBBBBBB');
			`);
		}
		await client.exec(await readFile(new URL(filename, directory), "utf8"));
	}
	const legacyTickets = await db.select().from(admissionTickets);
	assert.equal(legacyTickets.length, 2);
	assert.ok(legacyTickets.every(ticket => ticket.salesLogId === null));
	assert.equal((await db.select().from(ticketOrders))[0]?.providerOrderCode, 987654);
});
after(() => client.close());
beforeEach(async () => {
	await client.exec("TRUNCATE admission_tickets, ticket_sales_log_email_attempts, ticket_sales_logs, ticket_orders, ticket_gift_batches, ticket_credentials, ticket_email_jobs, ticket_payment_events, ticket_refunds, ticket_check_ins, ticket_audit, ticket_promos, ticket_settings, ticket_packages, ticket_rate_limits, admin_emails, admin_activity_logs CASCADE;");
	await db.insert(adminEmails).values([{ email: actor.email, role: "sales-collaborator" }, { email: other.email, role: "sales-collaborator" }, { email: root.email, role: "root" }, { email: "dev@example.com", role: "developer" }, { email: "staff@example.com", role: "entrance-staff" }, { email: "pro@example.com", role: "professional" }]);
	sendMail.mock.resetCalls(); mailFailure = false; waitForMail = null;
});
function context(email: string | null = actor.email, id = actor.id): Context {
	const now = new Date();
	const session: NonNullable<Awaited<ReturnType<Context["getFreshSession"]>>> = {
		user: { id, email: email ?? "", name: "Sales", emailVerified: true, image: null, createdAt: now, updatedAt: now },
		session: { id: "session", userId: id, token: "test", expiresAt: new Date(Date.now() + 60000), createdAt: now, updatedAt: now, ipAddress: null, userAgent: null },
	};
	return { auth: null, headers: new Headers(), getSession: async () => session, getFreshSession: async () => email ? session : null };
}
const caller = (email: string | null = actor.email, id = actor.id) => salesLogsRouter.createCaller(context(email, id));

test("sales collaborators have only the sales area; every endpoint requires fresh authorization", async () => {
	for (const area of adminAreas) assert.equal(canAccessAdminArea("sales-collaborator", area), area === "salesLog");
	for (const email of [null, "buyer@example.com", "staff@example.com", "pro@example.com"]) {
		const api = caller(email);
		const code = email ? "FORBIDDEN" : "UNAUTHORIZED";
		await assert.rejects(api.config(), { code });
		await assert.rejects(api.list({}), { code });
		await assert.rejects(api.create(input()), { code });
		await assert.rejects(api.createUploadUrl({ filename: "proof.png", mimeType: "image/png", fileSize: 20 }), { code });
		await assert.rejects(api.detail({ id: randomUUID() }), { code });
		await assert.rejects(api.proof({ id: randomUUID() }), { code });
		await assert.rejects(api.sendEmail({ id: randomUUID(), requestKey: randomUUID() }), { code });
	}
	const tickets = ticketsRouter.createCaller(context());
	await assert.rejects(tickets.adminConfig(), { code: "FORBIDDEN" });
	await assert.rejects(tickets.orders({}), { code: "FORBIDDEN" });
	await assert.rejects(tickets.lookup({ code: "A".repeat(20), requestKey: randomUUID() }), { code: "FORBIDDEN" });
	await db.delete(adminEmails).where(eq(adminEmails.email, actor.email));
	await assert.rejects(caller().list({}), { code: "FORBIDDEN" });
});

test("creation issues all credentials while online sales are closed, emails immediately, and never queues mail or creates orders", async () => {
	const sale = await caller().create(input());
	assert.equal(sale.emailStatus, "sent");
	const detail = await caller().detail({ id: sale.id });
	assert.equal(detail.tickets.length, 2);
	assert.equal(new Set(detail.tickets.map(t => t.code)).size, 2);
	assert.ok(detail.tickets.every(t => t.source === "sales-log" && t.ownerId === null && t.orderId === null && t.batchId === null && t.recipientEmail === "buyer@example.com"));
	assert.equal((await db.select().from(ticketCredentials)).length, 2);
	assert.equal((await db.select().from(ticketEmailJobs)).length, 0);
	assert.equal((await db.select().from(ticketOrders)).length, 0);
	assert.equal(sendMail.mock.callCount(), 1);
	const mail = sendMail.mock.calls[0]!.arguments[0]!;
	assert.equal(mail.to, "buyer@example.com");
	assert.equal(mail.attachments?.length, 2);
	assert.match(mail.text, /123\.456/);
	assert.match(mail.text, /Loại vé: Vé thường/);
	assert.doesNotMatch(mail.text, /Đơn hàng:|Gói vé:|PRIVATE_|Sales One/);
	assert.equal(detail.attempts[0]?.status, "sent");
	assert.ok(detail.actions.some(action => action.action === "salesLogCreated"));
	assert.equal("proofObjectKey" in sale, false);
	assert.equal("emailAttemptId" in sale, false);
});

for (const category of ["normal", "vip"] as const) {
	test(`zero-VND ${category} sales issue free tickets, email immediately, and preserve inventory and retry rules`, async () => {
		const request = input({ category, amountReceived: 0 });
		const sale = await caller().create(request);
		assert.equal(sale.amountReceived, 0);
		assert.equal(sale.emailStatus, "sent");
		const detail = await caller().detail({ id: sale.id });
		assert.equal(detail.tickets.length, request.quantity);
		assert.ok(detail.tickets.every(ticket => ticket.source === "sales-log" && ticket.category === category && ticket.validity === "valid"));
		assert.equal((await getTicketConfig()).vipUsed, category === "vip" ? request.quantity : 0);
		if (category === "vip") {
			await db.update(ticketSettings).set({ vipCapacity: request.quantity });
			await assert.rejects(caller().create(input({ category, quantity: 1, amountReceived: 0 })), { message: "vipSoldOut" });
		}
		const mail = sendMail.mock.calls[0]!.arguments[0]!;
		assert.match(mail.subject, /vé miễn phí/);
		for (const body of [mail.text, mail.html]) {
			assert.match(body, /vé miễn phí/);
			assert.doesNotMatch(body, /xác nhận thanh toán/);
			assert.match(body, /Tổng tiền đơn hàng: 0/);
		}
		assert.equal(mail.attachments?.length, request.quantity);
		assert.equal((await db.select().from(ticketOrders)).length, 0);
		assert.equal((await db.select().from(ticketEmailJobs)).length, 0);
		assert.equal((await caller().create(request)).id, sale.id);
		assert.equal(sendMail.mock.callCount(), 1);
		await assert.rejects(caller().create({ ...request, amountReceived: 1 }), { message: "requestChanged" });
		await createSalesLog(input({ amountReceived: 1 }), actor);
		assert.deepEqual((await caller().list({ minAmount: 0, maxAmount: 0 })).items.map(log => log.id), [sale.id]);
		const ticket = detail.tickets[0]!;
		assert.equal((await lookupTicket("staff", ticket.code, randomUUID())).outcome, "ready");
		assert.equal((await confirmCheckIn({ ticketId: ticket.id, credentialVersion: ticket.credentialVersion, requestKey: randomUUID() }, "staff", false)).outcome, "accepted");
	});
}

test("concurrent identical requests issue one sale and email; changed payloads conflict", async () => {
	const request = input();
	const results = await Promise.all([caller().create(request), caller().create(request), caller().create(request)]);
	assert.equal(new Set(results.map(s => s.id)).size, 1);
	assert.equal((await db.select().from(salesLogs)).length, 1);
	assert.equal((await db.select().from(admissionTickets)).length, 2);
	assert.equal(sendMail.mock.callCount(), 1);
	assert.equal((await caller().create(request)).emailStatus, "sent");
	for (const changes of [{ quantity: 3 }, { amountReceived: 10 }, { buyerEmail: "changed@example.com" }, { category: "vip" as const }]) await assert.rejects(caller().create({ ...request, ...changes }), { code: "CONFLICT", message: "requestChanged" });
	assert.equal(sendMail.mock.callCount(), 1);
});

test("a ticket insertion failure rolls back the log and reserved credentials", async () => {
	await client.exec("CREATE FUNCTION reject_second_ticket() RETURNS trigger AS $$ BEGIN IF NEW.ordinal = 2 THEN RAISE EXCEPTION 'simulated issuance failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_second BEFORE INSERT ON admission_tickets FOR EACH ROW EXECUTE FUNCTION reject_second_ticket();");
	try {
		await assert.rejects(caller().create(input()), { message: "operationFailed" });
		assert.equal((await db.select().from(salesLogs)).length, 0);
		assert.equal((await db.select().from(admissionTickets)).length, 0);
		assert.equal((await db.select().from(ticketCredentials)).length, 0);
		assert.equal(sendMail.mock.callCount(), 0);
	} finally { await client.exec("DROP TRIGGER reject_second ON admission_tickets; DROP FUNCTION reject_second_ticket();"); }
});

test("shared VIP capacity includes quantities and online reservations, cannot be reduced, and survives revocation", async () => {
	await db.insert(ticketSettings).values({ vipCapacity: 3 });
	await createSalesLog(input({ category: "vip", quantity: 2 }), actor);
	assert.equal((await getTicketConfig()).vipAvailable, 1);
	const vip = await db.select().from(admissionTickets);
	assert.deepEqual(vip[0]?.benefits, ["networkingLunch"]);
	await assert.rejects(createSalesLog(input({ category: "vip", quantity: 2 }), actor), { message: "vipSoldOut" });
	await db.update(admissionTickets).set({ validity: "revoked" });
	assert.equal((await getTicketConfig()).vipAvailable, 1);
	await assert.rejects(updateSettings({ isSalesOpened: false, vipCapacity: 1, prices: { Silver: 129000, Golden: 249000, Platinum: 349000, VIP: 199000 } }, root.id), { message: "capacityTooLow" });
	await db.insert(ticketOrders).values({ id: randomUUID(), buyerId: "buyer", requestKey: randomUUID(), providerOrderCode: 12345, snapshot: { packageName: "VIP", category: "vip", quantity: 1, currency: "VND", totalPrice: 199000, benefits: ["networkingLunch"] }, buyerName: "Buyer", buyerEmail: "buyer@example.com", buyerPhone: "0900000000", locale: "vi", reservation: "held", expiresAt: new Date(Date.now() + 60000) });
	assert.equal((await getTicketConfig()).vipAvailable, 0);
	await assert.rejects(createSalesLog(input({ category: "vip", quantity: 1 }), actor), { message: "vipSoldOut" });
	await db.update(ticketOrders).set({ expiresAt: new Date(0) });
	await createSalesLog(input({ category: "vip", quantity: 1 }), actor);
	assert.equal((await getTicketConfig()).vipAvailable, 0);
});

test("online VIP checkout cannot oversell capacity consumed by offline sales", async () => {
	await db.insert(ticketSettings).values({ vipCapacity: 1, isSalesOpened: true });
	await createSalesLog(input({ category: "vip", quantity: 1 }), actor);
	// A zero-price promo avoids invoking PayOS while exercising real checkout inventory SQL.
	const revision = randomUUID();
	await client.exec(`INSERT INTO ticket_promos (id, code, revision, prices) VALUES ('promo', 'FREE', '${revision}', '{"Silver":0,"Golden":0,"Platinum":0,"VIP":0}')`);
	await assert.rejects(startCheckout({ id: "buyer", email: "buyer@example.com" }, { requestKey: randomUUID(), packageName: "VIP", buyerName: "Buyer", buyerPhone: "0900000000", promo: { code: "FREE", revision } }), { message: "vipSoldOut" });
});

test("concurrent offline VIP sales cannot oversell", async () => {
	await db.insert(ticketSettings).values({ vipCapacity: 1 });
	const results = await Promise.allSettled([createSalesLog(input({ category: "vip", quantity: 1 }), actor), createSalesLog(input({ category: "vip", quantity: 1 }), other)]);
	assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
	assert.equal((await getTicketConfig()).vipAvailable, 0);
});

test("collaborators cannot inspect, email, view proofs, or retrieve images belonging to another creator", async () => {
	const own = await createSalesLog(input(), actor);
	const foreign = await createSalesLog(input(), other);
	assert.deepEqual((await caller().list({})).items.map(log => log.id), [own.id]);
	assert.equal((await caller(root.email, root.id).list({})).total, 2);
	assert.equal((await caller("dev@example.com", "dev").list({})).total, 2);
	await assert.rejects(caller().detail({ id: foreign.id }), { code: "NOT_FOUND" });
	await assert.rejects(caller().proof({ id: foreign.id }), { code: "NOT_FOUND" });
	await assert.rejects(caller().sendEmail({ id: foreign.id, requestKey: randomUUID() }), { code: "NOT_FOUND" });
	const [ticket] = await db.select().from(admissionTickets).where(eq(admissionTickets.salesLogId, foreign.id));
	await assert.rejects(accessibleTicket(ticket!.id, actor.id, false, true), { code: "NOT_FOUND" });
	await assert.rejects(accessibleTicket(ticket!.id, other.id, false), { code: "NOT_FOUND" });
	assert.equal((await accessibleTicket(ticket!.id, other.id, false, true)).id, ticket!.id);
});

test("mail failure preserves tickets, never retries automatically, and supports deduplicated immediate retry", async () => {
	mailFailure = true;
	const request = input();
	const log = await caller().create(request);
	assert.equal(log.emailStatus, "failed");
	assert.equal((await caller().create(request)).emailStatus, "failed");
	assert.equal(sendMail.mock.callCount(), 1);
	const tickets = (await caller().detail({ id: log.id })).tickets;
	mailFailure = false;
	const retry = { id: log.id, requestKey: randomUUID() };
	assert.equal((await caller().sendEmail(retry)).emailStatus, "sent");
	assert.equal((await caller().sendEmail(retry)).emailStatus, "sent");
	assert.equal(sendMail.mock.callCount(), 2);
	assert.deepEqual((await caller().detail({ id: log.id })).tickets, tickets);
	await assert.rejects(caller().sendEmail({ id: log.id, requestKey: randomUUID() }), { message: "emailAlreadySent" });
	await caller(root.email, root.id).sendEmail({ id: log.id, requestKey: randomUUID() });
	assert.equal(sendMail.mock.callCount(), 3);
	assert.equal((await db.select().from(ticketEmailJobs)).length, 0);
});

test("sending lease blocks parallel delivery and expired leases are manually recoverable", async () => {
	const log = await createSalesLog(input(), actor);
	let release!: () => void;
	let entered!: () => void;
	const started = new Promise<void>(resolve => { entered = resolve; });
	const gate = new Promise<void>(resolve => { release = resolve; });
	waitForMail = async () => { entered(); await gate; };
	const sending = sendSalesLogEmail(log.id, actor, randomUUID());
	await started;
	await assert.rejects(sendSalesLogEmail(log.id, actor, randomUUID()), { message: "emailSending" });
	release(); await sending;
	waitForMail = null;
	await db.update(salesLogs).set({ emailStatus: "sending", emailLeaseUntil: new Date(0) }).where(eq(salesLogs.id, log.id));
	assert.equal((await caller().detail({ id: log.id })).log.canRetryEmail, true);
	await sendSalesLogEmail(log.id, actor, randomUUID());
	assert.equal((await accessibleSalesLog(log.id, actor)).emailStatus, "sent");
	assert.ok((await db.select().from(salesLogEmailAttempts)).some(attempt => attempt.error === "deliveryUncertain"));
});

test("stale sender completion cannot overwrite a newer delivery attempt", async () => {
	const log = await createSalesLog(input(), actor);
	let release!: () => void;
	let entered!: () => void;
	const started = new Promise<void>(resolve => { entered = resolve; });
	const gate = new Promise<void>(resolve => { release = resolve; });
	waitForMail = async () => { entered(); await gate; };
	const sending = sendSalesLogEmail(log.id, actor, randomUUID()); await started;
	await db.update(salesLogs).set({ emailLeaseUntil: new Date(0) }).where(eq(salesLogs.id, log.id));
	waitForMail = null; mailFailure = true;
	await sendSalesLogEmail(log.id, actor, randomUUID());
	mailFailure = false; release(); await sending;
	assert.equal((await accessibleSalesLog(log.id, actor)).emailStatus, "failed");
});

test("filters compose, literal search works, every sort is stable, and dates use Vietnam days", async () => {
	const first = await createSalesLog(input({ buyerName: "Alice", quantity: 1, amountReceived: 100 }), actor);
	const second = await createSalesLog(input({ buyerName: "Bao", category: "vip", quantity: 1, amountReceived: 200 }), other);
	await db.update(salesLogs).set({ createdAt: new Date("2026-10-12T17:00:00Z"), emailStatus: "failed" }).where(eq(salesLogs.id, first.id));
	await db.update(salesLogs).set({ createdAt: new Date("2026-10-13T17:00:00Z"), proofUploadId: randomUUID(), proofFilename: "proof.png", proofObjectKey: "PRIVATE_OBJECT_KEY" }).where(eq(salesLogs.id, second.id));
	const api = caller(root.email, root.id);
	assert.equal((await api.list({ search: "alice", creator: "Sales One", minAmount: 100, maxAmount: 100, from: "2026-10-13", to: "2026-10-13", proof: "no", emailStatus: "failed", category: "normal", validity: "valid", checkIn: "unused" })).total, 1);
	assert.equal((await api.list({ proof: "yes" })).total, 1);
	for (const search of ["%", "_", "\\"]) assert.equal((await api.list({ search })).total, 0);
	for (const sort of ["createdAt", "buyer", "creator", "category", "quantity", "amountReceived", "emailStatus"] as const) for (const direction of ["asc", "desc"] as const) assert.equal((await api.list({ sort, direction })).total, 2);
	assert.equal(JSON.stringify(await api.list({})).includes("PRIVATE_OBJECT_KEY"), false);
	assert.equal((await api.list({ from: "2026-10-14", to: "2026-10-14" })).items[0]?.id, second.id);
	await db.update(admissionTickets).set({ acceptedCount: 1, validity: "revoked" }).where(eq(admissionTickets.salesLogId, first.id));
	assert.equal((await api.list({ checkIn: "admitted", validity: "revoked" })).items[0]?.id, first.id);
	await client.exec(`INSERT INTO ticket_sales_logs (id, request_key, buyer_name, buyer_email, buyer_phone, category, quantity, amount_received, created_by, creator_name, creator_email, created_at)
		SELECT 'page-' || lpad(n::text, 2, '0'), 'key-' || n, 'Page', 'page@example.com', '0900000000', 'normal', 1, 1, 'root', 'Root', 'root@example.com', '2026-10-20T00:00:00Z' FROM generate_series(1, 30) n`);
	const page1 = await api.list({ search: "Page", pageSize: 25 });
	const page2 = await api.list({ search: "Page", pageSize: 25, page: 1 });
	assert.equal(page1.total, 30); assert.equal(page2.items.length, 5);
	assert.equal(new Set([...page1.items, ...page2.items].map(log => log.id)).size, 30);
});

test("sales tickets use standard admission, replay protection, replacement and revocation", async () => {
	const log = await createSalesLog(input(), actor);
	const [ticket] = await db.select().from(admissionTickets).where(eq(admissionTickets.salesLogId, log.id));
	const lookup = await lookupTicket("staff", ticket!.code, randomUUID());
	assert.equal(lookup.outcome, "ready"); assert.equal(lookup.ticket?.recipientName, "Nguyễn An");
	const request = { ticketId: ticket!.id, credentialVersion: 1, requestKey: randomUUID() };
	const outcomes = await Promise.all([confirmCheckIn(request, "staff", false), confirmCheckIn({ ...request, requestKey: randomUUID() }, "staff-2", false)]);
	assert.deepEqual(outcomes.map(event => event.outcome).sort(), ["accepted", "rejected"]);
	await confirmCheckIn(request, "staff", false);
	const [current] = await db.select().from(admissionTickets).where(eq(admissionTickets.id, ticket!.id));
	assert.equal(current?.acceptedCount, 1);
	const rootTickets = ticketsRouter.createCaller(context(root.email, root.id));
	await rootTickets.changeTicket({ ticketId: ticket!.id, action: "replace", reason: "Compromised" });
	assert.equal((await lookupTicket("staff", ticket!.code, randomUUID())).outcome, "replaced");
	await rootTickets.changeTicket({ ticketId: ticket!.id, action: "revoke", reason: "Cancelled" });
	const result = await confirmCheckIn({ ticketId: ticket!.id, credentialVersion: 2, requestKey: randomUUID() }, "staff", false);
	assert.equal(result.reason, "revoked");
	const stats = await rootTickets.stats(); assert.equal(stats.salesLog, 2);
	const logs = await rootTickets.checkInLogs({ source: "sales-log" }); assert.ok(logs.total > 0);
	assert.ok(logs.items.every(item => item.salesLogId === log.id));
});

test("input and database constraints reject invalid amounts, quantities and mixed ticket ownership", async () => {
	for (const changes of [{ quantity: 0 }, { quantity: 101 }, { amountReceived: -1 }, { amountReceived: "0" }, { amountReceived: null }, { amountReceived: undefined }, { amountReceived: 2_000_000_001 }, { amountReceived: 1.5 }, { buyerName: "  " }, { buyerPhone: " " }, { buyerEmail: "invalid" }]) assert.equal(createSalesLogInput.safeParse({ ...input(), ...changes }).success, false);
	for (const filters of [{ from: "2026-02-30" }, { minAmount: 10, maxAmount: 1 }, { from: "2026-10-02", to: "2026-10-01" }, { pageSize: 500 }, { sort: "proofObjectKey" }]) assert.equal(salesLogPageInput.safeParse(filters).success, false);
	const log = await createSalesLog(input({ quantity: 1 }), actor);
	const [ticket] = await db.select().from(admissionTickets);
	await assert.rejects(db.update(admissionTickets).set({ ownerId: "buyer" }).where(eq(admissionTickets.id, ticket!.id)));
	await assert.rejects(db.insert(admissionTickets).values({ id: randomUUID(), source: "sales-log", salesLogId: log.id, category: "normal", ordinal: 1, code: "A".repeat(20) }));
	await assert.rejects(db.update(salesLogs).set({ quantity: 101 }));
	await assert.rejects(db.update(salesLogs).set({ amountReceived: -1 }));
});
