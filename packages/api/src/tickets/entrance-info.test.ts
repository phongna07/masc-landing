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

before(async () => { await client.exec(`
CREATE TABLE admin_emails (email text PRIMARY KEY, role text NOT NULL);
INSERT INTO admin_emails VALUES ('root@example.com','root'), ('developer@example.com','developer'), ('staff@example.com','entrance-staff'), ('professional@example.com','professional'), ('sales@example.com','sales-collaborator');
CREATE TABLE ticket_orders (id text PRIMARY KEY, provider_order_code bigint, buyer_name text, buyer_email text, buyer_phone text, snapshot jsonb, payment_status text, fulfillment_status text, paid_at timestamptz, referral_code text);
INSERT INTO ticket_orders VALUES ('order',123456,'Alice Buyer','alice@example.com','090 123 4567','{"packageName":"Golden","quantity":2,"totalPrice":200000,"promo":{"code":"PROMO"}}','paid','issued','2026-11-01T00:00:00Z','REF');
CREATE TABLE ticket_gift_batches (id text PRIMARY KEY, title text, note text);
INSERT INTO ticket_gift_batches VALUES ('batch','Sponsor gifts','Sponsor note');
CREATE TABLE ticket_sales_logs (id text PRIMARY KEY, buyer_name text, buyer_email text, buyer_phone text, quantity int, amount_received int, creator_name text, creator_email text);
INSERT INTO ticket_sales_logs VALUES ('sale','Sales Buyer','sales-buyer@example.com','0911111111',2,100000,'Issuer','issuer@example.com');
CREATE TABLE admission_tickets (id text PRIMARY KEY, source text, category text, order_id text, batch_id text, sales_log_id text, ordinal int, recipient_name text, recipient_email text, recipient_phone text, benefits jsonb DEFAULT '[]', validity text DEFAULT 'valid', created_at timestamptz DEFAULT '2026-11-02T00:00:00Z', accepted_count int DEFAULT 0, code text DEFAULT 'SECRET_CREDENTIAL');
INSERT INTO admission_tickets (id,source,category,order_id,batch_id,sales_log_id,ordinal,recipient_name,recipient_email,recipient_phone,validity,accepted_count) VALUES
('01','purchased','normal','order',NULL,NULL,1,NULL,NULL,NULL,'valid',1),
('02','purchased','normal','order',NULL,NULL,2,'Recipient','recipient@example.com','0922222222','revoked',0),
('03','gifted','vip',NULL,'batch',NULL,1,'Gift Guest','gift@example.com',NULL,'valid',0),
('04','gifted','normal',NULL,'batch',NULL,2,NULL,NULL,NULL,'valid',0),
('05','sales-log','normal',NULL,NULL,'sale',1,NULL,NULL,NULL,'valid',0),
('06','sales-log','normal',NULL,NULL,'sale',2,'Sales Recipient',NULL,NULL,'valid',0);
`); });
after(() => client.close());

function caller(email: string | null = "root@example.com") {
	const now = new Date();
	const session: NonNullable<Awaited<ReturnType<Context["getFreshSession"]>>> = {
		user: { id: "admin", name: "Admin", email: email ?? "", emailVerified: true, createdAt: now, updatedAt: now, image: null },
		session: { id: "session", userId: "admin", token: "test-token", expiresAt: new Date(Date.now() + 60000), createdAt: now, updatedAt: now, ipAddress: null, userAgent: null },
	};
	return ticketsRouter.createCaller({ auth: null, headers: new Headers(), getSession: async () => session, getFreshSession: async () => email ? session : null });
}

test("entrance information requires a fresh session and its own area permission", async () => {
	await assert.rejects(caller(null).entranceInfo(), { code: "UNAUTHORIZED" });
	for (const email of ["buyer@example.com", "professional@example.com", "sales@example.com"]) {
		await assert.rejects(caller(email).entranceInfo(), { code: "FORBIDDEN" });
	}
	for (const email of ["developer@example.com", "root@example.com", "staff@example.com"]) {
		assert.equal((await caller(email).entranceInfo()).length, 6);
	}
});

test("returns every source and separate recipient/buyer details without credentials", async () => {
	const rows = await caller().entranceInfo();
	assert.deepEqual(rows.map(row => row.id), ["01", "02", "03", "04", "05", "06"]);
	assert.equal(rows[0]!.buyerName, "Alice Buyer");
	assert.equal(rows[0]!.recipientName, null);
	assert.equal(rows[0]!.acceptedCount, 1);
	assert.equal(rows[0]!.orderCode, "123456");
	assert.equal(rows[0]!.packageName, "Golden");
	assert.equal(rows[0]!.orderQuantity, 2);
	assert.equal(rows[0]!.orderPrice, 200000);
	assert.equal(rows[0]!.promoCode, "PROMO");
	assert.equal(rows[1]!.validity, "revoked");
	assert.equal(rows[1]!.recipientName, "Recipient");
	assert.equal(rows[1]!.buyerEmail, "alice@example.com");
	assert.equal(rows[2]!.batchNote, "Sponsor note");
	assert.equal(rows[3]!.recipientEmail, null);
	assert.equal(rows[4]!.buyerName, "Sales Buyer");
	assert.equal(rows[4]!.amountReceived, 100000);
	assert.equal(rows[4]!.issuerEmail, "issuer@example.com");
	assert.equal(rows[5]!.recipientName, "Sales Recipient");
	assert.equal(JSON.stringify(rows).includes("SECRET"), false);
	for (const row of rows) assert.equal("code" in row || "credentialVersion" in row || "snapshot" in row, false);
});

test("loads beyond existing page sizes without duplicates, newest first", async () => {
	await client.exec(`INSERT INTO admission_tickets (id,source,category,batch_id,ordinal,created_at)
		SELECT 'bulk-' || lpad(n::text, 3, '0'), 'gifted','normal','batch',n+2,'2026-11-03T00:00:00Z' FROM generate_series(1, 150) n`);
	try {
		const rows = await caller().entranceInfo();
		assert.equal(rows.length, 156);
		assert.equal(new Set(rows.map(row => row.id)).size, 156);
		assert.equal(rows[0]!.id, "bulk-001");
		assert.equal(rows[149]!.id, "bulk-150");
		assert.equal(rows[150]!.id, "01");
	} finally { await client.exec("DELETE FROM admission_tickets WHERE id LIKE 'bulk-%'"); }
});
