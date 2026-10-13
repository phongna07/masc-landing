import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, mock, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { ticketAudit } from "@masc-landing/db/schema/tickets";
import { ticketTemplateSettings } from "@masc-landing/db/schema/ticket-templates";
import { defaultTicketTemplates } from "./template-input";

const client = new PGlite();
const db = drizzle(client);
mock.module("@masc-landing/db", { namedExports: { db } });
mock.module("@masc-landing/db/ticket-transaction", { namedExports: {
	ticketTransaction: (work: Parameters<typeof db.transaction>[0]) => db.transaction(work),
} });
const { getTicketTemplates, saveTicketTemplates } = await import("./template-settings");

before(async () => {
	// Apply the actual generated migration only inside this in-memory database.
	await client.exec(await readFile(new URL("../../../db/src/migrations/0022_same_zaran.sql", import.meta.url), "utf8"));
	await client.exec(`CREATE TABLE ticket_audit (
		id text PRIMARY KEY, actor_id text NOT NULL, action text NOT NULL,
		entity_id text, reason text, outcome text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
	)`);
});
after(() => client.close());
beforeEach(async () => { await client.exec("TRUNCATE ticket_template_settings, ticket_audit"); });

test("reads fall back to original defaults without creating settings or audit records", async () => {
	const initial = await getTicketTemplates();
	assert.deepEqual(initial, { config: defaultTicketTemplates, revision: 0, updatedAt: null });
	assert.equal((await db.select().from(ticketTemplateSettings)).length, 0);
	initial.config.artwork.brand = "Local draft";
	assert.notEqual((await getTicketTemplates()).config.artwork.brand, "Local draft");
});

test("saves persist normalized bilingual settings, advance revisions, and record an audit", async () => {
	const config = structuredClone(defaultTicketTemplates);
	config.artwork.brand = "New brand";
	config.locales.en.purchaseBody = "<div><b>Hello</b></div>";
	config.locales.vi.copy.subject = "Đã mua vé";
	const saved = await saveTicketTemplates({ config, revision: 0 }, "admin-a");
	assert.equal(saved.revision, 1);
	assert.equal(saved.config.locales.en.purchaseBody, "<p><strong>Hello</strong></p>");
	assert.equal(saved.config.locales.vi.copy.subject, "Đã mua vé");
	assert.deepEqual(await getTicketTemplates(), saved);
	const [entry] = await db.select().from(ticketAudit);
	assert.equal(entry!.action, "templatesUpdated");
	assert.equal(entry!.actorId, "admin-a");
	assert.equal(entry!.entityId, "1");
	assert.equal((await saveTicketTemplates({ config: saved.config, revision: 1 }, "admin-a")).revision, 2);
});

test("a stale or simultaneous save cannot overwrite a newer revision or add a success audit", async () => {
	const first = structuredClone(defaultTicketTemplates);
	first.artwork.brand = "First";
	const second = structuredClone(defaultTicketTemplates);
	second.artwork.brand = "Second";
	const results = await Promise.allSettled([
		saveTicketTemplates({ config: first, revision: 0 }, "admin-a"),
		saveTicketTemplates({ config: second, revision: 0 }, "admin-b"),
	]);
	assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
	const failure = results.find(result => result.status === "rejected") as PromiseRejectedResult;
	assert.equal(failure.reason.message, "templatesChanged");
	assert.equal(failure.reason.code, "CONFLICT");
	assert.equal((await getTicketTemplates()).revision, 1);
	assert.equal((await db.select().from(ticketAudit)).length, 1);
});

test("invalid HTML in the inactive locale cannot be persisted", async () => {
	const config = structuredClone(defaultTicketTemplates);
	config.locales.vi.giftBody = '<a href="https://example.com/{{orderId}}">Hello</a>';
	await assert.rejects(saveTicketTemplates({ config, revision: 0 }, "admin-a"), { message: "invalidTemplateBody" });
	assert.equal((await db.select().from(ticketTemplateSettings)).length, 0);
	assert.equal((await db.select().from(ticketAudit)).length, 0);
});

test("metadata migration removes existing event data and keeps unrelated template customization", async () => {
	const migrationClient = new PGlite();
	try {
		await migrationClient.exec(`
			CREATE TABLE admission_tickets (id text PRIMARY KEY, event jsonb NOT NULL);
			CREATE TABLE ticket_gift_batches (id text PRIMARY KEY, event jsonb NOT NULL);
			CREATE TABLE ticket_settings (id integer PRIMARY KEY, event jsonb NOT NULL, vip_capacity integer);
			CREATE TABLE ticket_orders (id text PRIMARY KEY, snapshot jsonb NOT NULL);
			INSERT INTO admission_tickets VALUES ('ticket', '{"name":"Old event"}');
			INSERT INTO ticket_gift_batches VALUES ('batch', '{"name":"Old event"}');
			INSERT INTO ticket_settings VALUES (1, '{"name":"Old event"}', 30);
			INSERT INTO ticket_orders VALUES ('order', '{"packageName":"Golden","quantity":2,"totalPrice":249000,"event":{"name":"Old event"}}');
		`);
		await migrationClient.exec(await readFile(new URL("../../../db/src/migrations/0022_same_zaran.sql", import.meta.url), "utf8"));
		const migrationDb = drizzle(migrationClient);
		const config = structuredClone(defaultTicketTemplates);
		config.artwork.brand = "Keep this brand";
		config.locales.en.copy.subject = "Keep this subject";
		Object.assign(config.locales.en.copy, { dateUnknown: "Old date", venueUnknown: "Old venue" });
		Object.assign(config.locales.vi.copy, { dateUnknown: "Ngày cũ", venueUnknown: "Nơi cũ" });
		config.locales.en.purchaseBody = "<p>Welcome to {{ eventName }}</p>";
		config.locales.en.giftBody = "<p>{{eventDate}} at {{venue}}</p>";
		config.locales.vi.purchaseBody = "<p>Xin chào {{recipientName}}</p>";
		config.locales.vi.giftBody = "<p>{{ venue }}</p>";
		await migrationDb.insert(ticketTemplateSettings).values({ id: 1, config, revision: 4 });
		await migrationClient.exec(await readFile(new URL("../../../db/src/migrations/0023_moaning_snowbird.sql", import.meta.url), "utf8"));
		const [saved] = await migrationDb.select().from(ticketTemplateSettings);
		const expected = structuredClone(defaultTicketTemplates);
		expected.artwork.brand = config.artwork.brand;
		expected.locales.en.copy.subject = config.locales.en.copy.subject;
		expected.locales.vi.purchaseBody = config.locales.vi.purchaseBody;
		assert.deepEqual(saved!.config, expected);
		assert.equal(saved!.revision, 5);
		assert.deepEqual((await migrationClient.query("SELECT snapshot FROM ticket_orders")).rows, [
			{ snapshot: { packageName: "Golden", quantity: 2, totalPrice: 249000 } },
		]);
		assert.deepEqual((await migrationClient.query("SELECT * FROM ticket_settings")).rows, [{ id: 1, vip_capacity: 30 }]);
		assert.deepEqual((await migrationClient.query("SELECT * FROM admission_tickets")).rows, [{ id: "ticket" }]);
		assert.deepEqual((await migrationClient.query("SELECT * FROM ticket_gift_batches")).rows, [{ id: "batch" }]);
	} finally {
		await migrationClient.close();
	}
});
