import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { adminEmails, type AdminRole } from "@masc-landing/db/schema/admin-emails";
import { adminActivityLogs } from "@masc-landing/db/schema/admin-activity-logs";
import { ticketAudit } from "@masc-landing/db/schema/tickets";
import type { Context } from "../context";

// Exercise the real session/role middleware, rate limit and audit SQL against
// isolated PostgreSQL. Never connect to the configured database or send mail.
const client = new PGlite();
const db = drizzle(client);
let emailFailure: Error | null = null;
const runTicketEmailJobs = mock.fn(async (_limit: number) => {
	if (emailFailure) throw emailFailure;
	return { processed: 2, runId: "test-run" };
});
mock.module("@masc-landing/db", { namedExports: { db } });
mock.module("@masc-landing/db/ticket-transaction", { namedExports: {
	ticketTransaction: (work: Parameters<typeof db.transaction>[0]) => db.transaction(work),
} });
mock.module("@masc-landing/env/server", { namedExports: { env: {} } });
mock.module(new URL("./email.ts", import.meta.url).href, { namedExports: { runTicketEmailJobs } });
const { ticketsRouter } = await import("../routers/tickets");

before(async () => {
	await client.exec(`
		CREATE TYPE admin_role AS ENUM ('root', 'professional', 'entrance-staff', 'developer');
		CREATE TABLE admin_emails (email text PRIMARY KEY, role admin_role NOT NULL);
		CREATE TABLE ticket_rate_limits (
			key text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), count integer NOT NULL DEFAULT 1
		);
		CREATE TABLE ticket_audit (
			id text PRIMARY KEY, actor_id text NOT NULL, action text NOT NULL, entity_id text,
			reason text, metadata jsonb, outcome text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE admin_activity_logs (
			id text PRIMARY KEY, actor_user_id text NOT NULL, actor_name text NOT NULL, actor_email text NOT NULL,
			actor_role text NOT NULL, procedure_path text NOT NULL, procedure_type text NOT NULL,
			input jsonb, outcome text NOT NULL, error_code text, created_at timestamp NOT NULL DEFAULT now()
		);
		CREATE TABLE ticket_orders (id text PRIMARY KEY, provider_order_code bigint);
		CREATE TABLE ticket_email_jobs (
			id text PRIMARY KEY, order_id text, ticket_id text, to_address text, status text,
			attempts integer DEFAULT 0, next_attempt_at timestamptz DEFAULT now(),
			sent_at timestamptz, created_at timestamptz DEFAULT now(),
			dedupe_key text DEFAULT 'PRIVATE_DEDUPE_KEY', last_error text DEFAULT 'PRIVATE_PROVIDER_ERROR'
		);
	`);
});
after(() => client.close());
beforeEach(async () => {
	await client.exec("TRUNCATE admin_emails, ticket_rate_limits, ticket_audit, admin_activity_logs, ticket_orders, ticket_email_jobs;");
	runTicketEmailJobs.mock.resetCalls();
	emailFailure = null;
});

function session(email: string): NonNullable<Awaited<ReturnType<Context["getFreshSession"]>>> {
	const now = new Date();
	return {
		user: { id: email, name: "Admin", email, emailVerified: true, createdAt: now, updatedAt: now, image: null },
		session: { id: "session", userId: email, token: "session-token", expiresAt: new Date(Date.now() + 60_000), createdAt: now, updatedAt: now, ipAddress: null, userAgent: null },
	};
}
function caller(email: string | null) {
	return ticketsRouter.createCaller({
		auth: null, headers: new Headers(),
		getSession: async () => session("root@example.com"),
		getFreshSession: async () => email ? session(email) : null,
	});
}
async function admin(role: AdminRole) {
	const email = `${role}@example.com`;
	await db.insert(adminEmails).values({ email, role });
	return caller(email);
}

test("email sending requires a fresh authenticated session even if a cached session exists", async () => {
	await admin("root");
	await assert.rejects(caller(null).triggerEmailSending(), { code: "UNAUTHORIZED" });
	assert.equal(runTicketEmailJobs.mock.callCount(), 0);
});

test("buyers and admins without ticket-management access cannot trigger email sending", async () => {
	await assert.rejects(caller("buyer@example.com").triggerEmailSending(), { code: "FORBIDDEN" });
	for (const role of ["entrance-staff", "professional"] as const) {
		await assert.rejects((await admin(role)).triggerEmailSending(), { code: "FORBIDDEN" });
	}
	assert.equal(runTicketEmailJobs.mock.callCount(), 0);
	assert.deepEqual(await db.select().from(ticketAudit), []);
});

test("ticket admins process the worker's email batch without a worker secret and are audited", async () => {
	assert.deepEqual(await (await admin("root")).triggerEmailSending(), { processed: 2, runId: "test-run" });
	assert.deepEqual(runTicketEmailJobs.mock.calls[0]?.arguments, [2]);
	const [entry] = await db.select().from(ticketAudit);
	assert.equal(entry?.actorId, "root@example.com");
	assert.equal(entry?.action, "emailSendingTriggered");
	const [activity] = await db.select().from(adminActivityLogs);
	assert.equal(activity?.procedurePath, "triggerEmailSending");
	assert.equal(activity?.outcome, "success");
});

test("developers inherit ticket management access", async () => {
	const developer = await admin("developer");
	assert.deepEqual(await developer.triggerEmailSending(), { processed: 2, runId: "test-run" });
	assert.equal((await developer.emailJobs({})).total, 0);
});

test("repeated triggers are rate limited before invoking the email service", async () => {
	const root = await admin("root");
	for (let i = 0; i < 6; i++) await root.triggerEmailSending();
	await assert.rejects(root.triggerEmailSending(), { code: "TOO_MANY_REQUESTS", message: "rateLimited" });
	assert.equal(runTicketEmailJobs.mock.callCount(), 6);
});

test("email service errors are sanitized and recorded as failed admin actions", async () => {
	emailFailure = new Error("provider response containing sensitive data");
	await assert.rejects((await admin("root")).triggerEmailSending(), { code: "INTERNAL_SERVER_ERROR", message: "operationFailed" });
	assert.deepEqual(await db.select().from(ticketAudit), []);
	const [activity] = await db.select().from(adminActivityLogs);
	assert.equal(activity?.outcome, "failure");
	assert.equal(activity?.errorCode, "INTERNAL_SERVER_ERROR");
});

test("email queue listing requires a fresh session and ticket-management access", async () => {
	await admin("root");
	await assert.rejects(caller(null).emailJobs({}), { code: "UNAUTHORIZED" });
	await assert.rejects(caller("buyer@example.com").emailJobs({}), { code: "FORBIDDEN" });
	for (const role of ["entrance-staff", "professional"] as const) {
		await assert.rejects((await admin(role)).emailJobs({}), { code: "FORBIDDEN" });
	}
});

test("email queue includes purchases and gifts, filters statuses and preserves global counts", async () => {
	const root = await admin("root");
	await client.exec(`
		INSERT INTO ticket_orders VALUES ('order', 123456);
		INSERT INTO ticket_email_jobs (id, order_id, ticket_id, to_address, status, attempts, sent_at) VALUES
			('pending', 'order', NULL, 'buyer@example.com', 'pending', 1, NULL),
			('sending', NULL, 'gift', 'gift@example.com', 'sending', 2, NULL),
			('sent', 'order', NULL, 'buyer@example.com', 'sent', 1, '2026-10-17T00:00:00Z'),
			('failed', NULL, 'gift', 'gift@example.com', 'failed', 6, NULL);
	`);
	const result = await root.emailJobs({});
	assert.equal(result.total, 4);
	assert.deepEqual(result.counts, { all: 4, pending: 1, sending: 1, sent: 1, failed: 1 });
	assert.equal(result.items.find(job => job.id === "pending")?.orderCode, 123456);
	assert.equal(result.items.find(job => job.id === "sending")?.ticketId, "gift");
	assert.equal(JSON.stringify(result).includes("PRIVATE_"), false);
	for (const status of ["pending", "sending", "sent", "failed"] as const) {
		const filtered = await root.emailJobs({ status });
		assert.equal(filtered.total, 1);
		assert.deepEqual(filtered.items.map(job => job.id), [status]);
		assert.deepEqual(filtered.counts, result.counts);
	}
});

test("email queue pagination uses a stable order and reports the full count", async () => {
	const root = await admin("root");
	await client.exec(`INSERT INTO ticket_email_jobs (id, to_address, status, created_at)
		SELECT 'job-' || lpad(n::text, 2, '0'), 'buyer@example.com', 'sent', '2026-10-17T00:00:00Z'
		FROM generate_series(1, 30) n`);
	const first = await root.emailJobs({ status: "sent" });
	const second = await root.emailJobs({ status: "sent", page: 1 });
	assert.equal(first.total, 30);
	assert.equal(second.total, 30);
	assert.equal(first.items.length, 25);
	assert.equal(second.items.length, 5);
	assert.equal(first.items[0]?.id, "job-01");
	assert.equal(second.items[0]?.id, "job-26");
	assert.equal(new Set([...first.items, ...second.items].map(job => job.id)).size, 30);
});

test("empty email queues have zero counts and invalid filters are rejected", async () => {
	const root = await admin("root");
	const result = await root.emailJobs({});
	assert.deepEqual(result.items, []);
	assert.equal(result.total, 0);
	assert.deepEqual(result.counts, { all: 0, pending: 0, sending: 0, sent: 0, failed: 0 });
	await assert.rejects(root.emailJobs({ page: -1 }), { code: "BAD_REQUEST" });
});
