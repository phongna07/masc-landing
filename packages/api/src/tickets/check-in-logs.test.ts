import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Context } from "../context";

// Run the query and access middleware against isolated PostgreSQL, never Neon.
const client = new PGlite();
const db = drizzle(client);
mock.module("@masc-landing/db", { namedExports: { db } });
mock.module("@masc-landing/db/ticket-transaction", { namedExports: {
	ticketTransaction: (work: Parameters<typeof db.transaction>[0]) => db.transaction(work),
} });
mock.module("@masc-landing/env/server", { namedExports: { env: {} } });
const { ticketsRouter } = await import("../routers/tickets");
const { checkInLogsInput } = await import("./check-in-logs");

before(async () => {
	await client.exec(`
		CREATE TABLE admin_emails (email text PRIMARY KEY, role text NOT NULL);
		INSERT INTO admin_emails VALUES ('root@example.com', 'root'), ('staff@example.com', 'entrance-staff'), ('professional@example.com', 'professional');
		CREATE TABLE "user" (id text PRIMARY KEY, name text, email text);
		INSERT INTO "user" VALUES ('staff', 'Entrance Staff', 'staff@example.com');
		CREATE TABLE ticket_orders (id text PRIMARY KEY, provider_order_code bigint, buyer_name text, buyer_email text, buyer_phone text);
		INSERT INTO ticket_orders VALUES ('order', 123456, 'Alice Buyer', 'alice@example.com', '0900000000');
		CREATE TABLE ticket_gift_batches (id text PRIMARY KEY, title text);
		INSERT INTO ticket_gift_batches VALUES ('batch', 'Sponsor gifts');
		CREATE TABLE admission_tickets (
			id text PRIMARY KEY, source text, category text, order_id text, batch_id text,
			ordinal integer, recipient_name text, recipient_email text, recipient_phone text, code text
		);
		INSERT INTO admission_tickets VALUES
			('purchased', 'purchased', 'normal', 'order', NULL, 1, NULL, NULL, NULL, 'SECRET_PURCHASE_CODE'),
			('gifted', 'gifted', 'vip', NULL, 'batch', 1, 'Bao Guest', 'bao@example.com', '0911111111', 'SECRET_GIFT_CODE'),
			('anonymous-gift', 'gifted', 'normal', NULL, 'batch', 2, NULL, NULL, NULL, 'SECRET_ANONYMOUS_CODE');
		ALTER TABLE admission_tickets ADD COLUMN sales_log_id text;
		CREATE TABLE ticket_check_ins (
			id text PRIMARY KEY, ticket_id text, actor_id text, request_key text, outcome text,
			reason text, is_override boolean, created_at timestamptz
		);
		INSERT INTO ticket_check_ins VALUES
			('01', 'purchased', 'staff', '01', 'accepted', 'firstAdmission', false, '2026-10-12T16:59:59Z'),
			('02', 'gifted', 'staff', '02', 'accepted', 'firstAdmission', false, '2026-10-12T17:00:00Z'),
			('03', 'gifted', 'staff', '03', 'rejected', 'alreadyAdmitted', false, '2026-10-13T02:00:00Z'),
			('04', 'purchased', 'deleted-staff', '04', 'accepted', 'Approved re-entry', true, '2026-10-13T16:59:59.999Z'),
			('05', NULL, 'staff', '05', 'rejected', 'notFound', false, '2026-10-13T17:00:00Z'),
			('06', 'anonymous-gift', 'staff', '06', 'accepted', 'firstAdmission', false, '2026-10-14T03:00:00Z'),
			('07', 'gifted', 'staff', '07', 'rejected', 'replaced', false, '2026-10-14T03:00:00Z');
	`);
});
after(() => client.close());

function caller(email: string | null = "root@example.com") {
	const now = new Date();
	const session: NonNullable<Awaited<ReturnType<Context["getFreshSession"]>>> = {
		user: { id: "admin", name: "Admin", email: email ?? "", emailVerified: true, createdAt: now, updatedAt: now, image: null },
		session: { id: "session", userId: "admin", token: "test-token", expiresAt: new Date(Date.now() + 60000), createdAt: now, updatedAt: now, ipAddress: null, userAgent: null },
	};
	return ticketsRouter.createCaller({ auth: null, headers: new Headers(), getSession: async () => session, getFreshSession: async () => email ? session : null });
}

test("check-in logs require a fresh session and ticket-management access", async () => {
	await assert.rejects(caller(null).checkInLogs({}), { code: "UNAUTHORIZED" });
	for (const email of ["buyer@example.com", "staff@example.com", "professional@example.com"]) {
		await assert.rejects(caller(email).checkInLogs({}), { code: "FORBIDDEN" });
	}
});

test("logs include purchases, gifts, rejected scans and unidentified tickets without credentials", async () => {
	const result = await caller().checkInLogs({});
	assert.equal(result.total, 7);
	assert.deepEqual(result.items.map(row => row.id), ["06", "07", "05", "04", "03", "02", "01"]);
	const purchase = result.items.find(row => row.id === "01")!;
	assert.equal(purchase.recipientName, "Alice Buyer");
	assert.equal(purchase.recipientEmail, "alice@example.com");
	assert.equal(purchase.recipientPhone, "0900000000");
	assert.equal(purchase.orderCode, 123456);
	const gift = result.items.find(row => row.id === "02")!;
	assert.equal(gift.recipientName, "Bao Guest");
	assert.equal(gift.batchTitle, "Sponsor gifts");
	assert.equal(gift.actorName, "Entrance Staff");
	assert.equal(result.items.find(row => row.id === "04")!.actorName, null);
	assert.equal(result.items.find(row => row.id === "05")!.source, null);
	assert.equal(result.items.find(row => row.id === "06")!.recipientName, null);
	assert.equal(JSON.stringify(result).includes("SECRET_"), false);
	assert.equal(result.items.some(row => "code" in row || "requestKey" in row), false);
});

test("source, category, outcome, override and staff filters compose before pagination", async () => {
	const result = await caller().checkInLogs({ source: "gifted", category: "vip", outcome: "rejected", admissionType: "standard", staff: "STAFF@EXAMPLE.COM" });
	assert.deepEqual(result.items.map(row => row.id), ["07", "03"]);
	assert.equal(result.total, 2);
	assert.deepEqual((await caller().checkInLogs({ admissionType: "override", staff: "deleted-staff" })).items.map(row => row.id), ["04"]);
	assert.deepEqual((await caller().checkInLogs({ source: "unknown" })).items.map(row => row.id), ["05"]);
});

test("search matches buyer, gift recipient, contacts, order reference and batch title literally", async () => {
	for (const search of ["alice", "ALICE@EXAMPLE.COM", "0900000000", "123456", "order", "purchased"]) {
		assert.equal((await caller().checkInLogs({ search })).total, 2);
	}
	for (const search of ["bao", "bao@example.com", "0911111111"]) {
		assert.equal((await caller().checkInLogs({ search })).total, 3);
	}
	assert.equal((await caller().checkInLogs({ search: "Sponsor gifts" })).total, 4);
	for (const search of ["%", "_", "\\"]) assert.equal((await caller().checkInLogs({ search })).total, 0);
});

test("date filters include both complete Vietnam calendar days", async () => {
	const result = await caller().checkInLogs({ from: "2026-10-13", to: "2026-10-13", direction: "asc" });
	assert.deepEqual(result.items.map(row => row.id), ["02", "03", "04"]);
	assert.equal((await caller().checkInLogs({ from: "2026-10-14" })).total, 3);
	assert.equal((await caller().checkInLogs({ to: "2026-10-12" })).total, 1);
});

test("all supported sorts run in both directions and keep missing recipients last", async () => {
	for (const sort of ["createdAt", "recipient", "actor", "source", "category", "outcome"] as const) {
		for (const direction of ["asc", "desc"] as const) {
			const result = await caller().checkInLogs({ sort, direction });
			assert.equal(result.total, 7);
			assert.equal(new Set(result.items.map(row => row.id)).size, 7);
		}
	}
	const asc = await caller().checkInLogs({ sort: "recipient", direction: "asc" });
	assert.equal(asc.items[0]!.recipientName, "Alice Buyer");
	assert.equal(asc.items.at(-1)!.recipientName, null);
	const desc = await caller().checkInLogs({ sort: "recipient", direction: "desc" });
	assert.equal(desc.items[0]!.recipientName, "Bao Guest");
	assert.equal(desc.items.at(-1)!.recipientName, null);
});

test("pagination uses a stable tie breaker and returns the complete filtered count", async () => {
	await client.exec(`INSERT INTO ticket_check_ins
		SELECT 'page-' || lpad(n::text, 2, '0'), 'gifted', 'staff', 'page-' || n, 'accepted', 'firstAdmission', false, '2026-10-15T00:00:00Z'
		FROM generate_series(1, 30) n`);
	try {
		const first = await caller().checkInLogs({ from: "2026-10-15", pageSize: 25 });
		const second = await caller().checkInLogs({ from: "2026-10-15", pageSize: 25, page: 1 });
		assert.equal(first.total, 30);
		assert.equal(second.total, 30);
		assert.equal(first.items.length, 25);
		assert.equal(second.items.length, 5);
		assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, 30);
		assert.equal(first.items[0]!.id, "page-01");
		assert.equal(second.items[0]!.id, "page-26");
	} finally { await client.exec("DELETE FROM ticket_check_ins WHERE id LIKE 'page-%'"); }
});

test("invalid date ranges and unbounded query inputs are rejected", () => {
	for (const input of [{ from: "2026-10-14", to: "2026-10-13" }, { from: "2026-02-30" }, { page: -1 }, { pageSize: 1000 }, { sort: "code" }, { search: "a".repeat(101) }]) {
		assert.equal(checkInLogsInput.safeParse(input).success, false);
	}
});
