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
		CREATE TYPE admin_role AS ENUM ('root', 'professional', 'entrance-staff');
		CREATE TABLE admin_emails (email text PRIMARY KEY, role admin_role NOT NULL);
		CREATE TABLE ticket_rate_limits (
			key text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), count integer NOT NULL DEFAULT 1
		);
		CREATE TABLE ticket_audit (
			id text PRIMARY KEY, actor_id text NOT NULL, action text NOT NULL, entity_id text,
			reason text, outcome text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
		);
		CREATE TABLE admin_activity_logs (
			id text PRIMARY KEY, actor_user_id text NOT NULL, actor_name text NOT NULL, actor_email text NOT NULL,
			actor_role text NOT NULL, procedure_path text NOT NULL, procedure_type text NOT NULL,
			input jsonb, outcome text NOT NULL, error_code text, created_at timestamp NOT NULL DEFAULT now()
		);
	`);
});
after(() => client.close());
beforeEach(async () => {
	await client.exec("TRUNCATE admin_emails, ticket_rate_limits, ticket_audit, admin_activity_logs;");
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
