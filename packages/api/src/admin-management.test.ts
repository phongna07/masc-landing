import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { adminEmails } from "@masc-landing/db/schema/admin-emails";
import { adminActivityLogs } from "@masc-landing/db/schema/admin-activity-logs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { adminAreas, canAccessAdminArea } from "./admin-roles";
import type { Context } from "./context";

// Use isolated PostgreSQL with the real middleware and SQL; never the configured database.
const client = new PGlite();
const db = drizzle(client);
mock.module("@masc-landing/db", { namedExports: { db } });
const { adminManagementRouter } = await import("./routers/admin-management");

before(async () => {
	await client.exec(`
		CREATE TYPE admin_role AS ENUM ('root', 'professional', 'entrance-staff', 'developer', 'sales-collaborator');
		CREATE TABLE admin_emails (
			email text PRIMARY KEY CHECK (email <> '' AND email = lower(btrim(email))), role admin_role NOT NULL
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
	await client.exec(`TRUNCATE admin_emails, admin_activity_logs;
		INSERT INTO admin_emails VALUES ('developer@example.com', 'developer'), ('other-dev@example.com', 'developer'),
			('root@example.com', 'root'), ('professional@example.com', 'professional'), ('staff@example.com', 'entrance-staff');`);
});

function caller(email: string | null = "developer@example.com") {
	const now = new Date();
	const session: NonNullable<Awaited<ReturnType<Context["getFreshSession"]>>> = {
		user: { id: "admin", name: "Admin", email: email ?? "", emailVerified: true, createdAt: now, updatedAt: now, image: null },
		session: { id: "session", userId: "admin", token: "test-token", expiresAt: new Date(Date.now() + 60000), createdAt: now, updatedAt: now, ipAddress: null, userAgent: null },
	};
	return adminManagementRouter.createCaller({ auth: null, headers: new Headers(), getSession: async () => session, getFreshSession: async () => email ? session : null });
}

test("developer has every area while root is excluded only from admin management", () => {
	for (const area of adminAreas) {
		assert.equal(canAccessAdminArea("developer", area), true);
		assert.equal(canAccessAdminArea("root", area), area !== "manageAdmins");
	}
	assert.equal(canAccessAdminArea("professional", "manageAdmins"), false);
	assert.equal(canAccessAdminArea("entrance-staff", "manageAdmins"), false);
});

test("every operation requires a fresh session and developer access", async () => {
	for (const email of [null, "buyer@example.com", "root@example.com", "professional@example.com", "staff@example.com"]) {
		const api = caller(email);
		const code = email ? "FORBIDDEN" : "UNAUTHORIZED";
		await assert.rejects(api.list(), { code });
		await assert.rejects(api.create({ email: "new@example.com", role: "root" }), { code });
		await assert.rejects(api.update({ originalEmail: "root@example.com", email: "new@example.com", role: "professional" }), { code });
		await assert.rejects(api.delete({ originalEmail: "root@example.com" }), { code });
	}
});

test("developers can list all records and create, rename, change roles, and delete other admins", async () => {
	const api = caller();
	assert.equal((await api.list()).filter(row => row.role === "developer").length, 2);
	for (const role of ["root", "professional", "entrance-staff", "sales-collaborator"] as const) {
		assert.deepEqual(await api.create({ email: "  NEW@EXAMPLE.COM  ", role }), { email: "new@example.com", role });
		assert.deepEqual(await api.update({ originalEmail: " NEW@EXAMPLE.COM ", email: "RENAMED@EXAMPLE.COM", role: "professional" }), { email: "renamed@example.com", role: "professional" });
		assert.equal((await api.list()).some(row => row.email === "new@example.com"), false);
		await api.delete({ originalEmail: " RENAMED@EXAMPLE.COM " });
	}
	assert.equal((await api.list()).length, 5);
	const logs = await db.select().from(adminActivityLogs);
	assert.equal(logs.length, 12);
	assert.ok(logs.every(row => row.outcome === "success" && row.actorRole === "developer"));
});

test("developer roles cannot be assigned, including crafted inputs", async () => {
	const api = caller();
	for (const role of ["developer", "invalid", "", "ROOT"]) {
		await assert.rejects(api.create({ email: "new@example.com", role: role as "root" }), { code: "BAD_REQUEST" });
		await assert.rejects(api.update({ originalEmail: "root@example.com", email: "root@example.com", role: role as "root" }), { code: "BAD_REQUEST" });
	}
	for (const email of ["", "invalid", "a".repeat(255) + "@example.com"]) {
		await assert.rejects(api.create({ email, role: "root" }), { code: "BAD_REQUEST" });
	}
});

test("developer records cannot be changed, deleted, or overwritten through email collisions", async () => {
	const api = caller();
	for (const originalEmail of ["developer@example.com", "other-dev@example.com"]) {
		await assert.rejects(api.update({ originalEmail, email: "renamed@example.com", role: "root" }), { code: "CONFLICT", message: "recordProtectedOrMissing" });
		await assert.rejects(api.delete({ originalEmail: originalEmail.toUpperCase() }), { code: "CONFLICT" });
		await assert.rejects(api.create({ email: originalEmail, role: "root" }), { code: "CONFLICT", message: "emailExists" });
		await assert.rejects(api.update({ originalEmail: "root@example.com", email: originalEmail, role: "root" }), { code: "CONFLICT", message: "emailExists" });
	}
	assert.equal((await api.list()).filter(row => row.role === "developer").length, 2);
	assert.equal((await api.list()).length, 5);
});

test("duplicate emails and missing records fail without replacing existing admins", async () => {
	const api = caller();
	await assert.rejects(api.create({ email: " ROOT@EXAMPLE.COM ", role: "professional" }), { code: "CONFLICT", message: "emailExists" });
	await assert.rejects(api.update({ originalEmail: "root@example.com", email: "professional@example.com", role: "entrance-staff" }), { code: "CONFLICT", message: "emailExists" });
	await assert.rejects(api.update({ originalEmail: "missing@example.com", email: "new@example.com", role: "root" }), { code: "CONFLICT" });
	await assert.rejects(api.delete({ originalEmail: "missing@example.com" }), { code: "CONFLICT" });
	assert.equal((await api.list()).find(row => row.email === "root@example.com")?.role, "root");
});

test("writes protect newly promoted developers and authorization follows manual database changes", async () => {
	const api = caller();
	await db.update(adminEmails).set({ role: "developer" }).where(eq(adminEmails.email, "root@example.com"));
	await assert.rejects(api.update({ originalEmail: "root@example.com", email: "new@example.com", role: "professional" }), { code: "CONFLICT" });
	await assert.rejects(api.delete({ originalEmail: "root@example.com" }), { code: "CONFLICT" });
	await db.update(adminEmails).set({ role: "root" }).where(eq(adminEmails.email, "developer@example.com"));
	await assert.rejects(api.list(), { code: "FORBIDDEN" });
	await assert.rejects(api.create({ email: "new@example.com", role: "root" }), { code: "FORBIDDEN" });
});
