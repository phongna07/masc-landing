import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { ticketTemplateSettings, type TicketTemplateConfig } from "@masc-landing/db/schema/ticket-templates";

// Historical migration coverage; runtime templates no longer use this table.
const legacyTemplateFixture = (): TicketTemplateConfig => ({
	artwork: { brand: "MASC · HYPERNOVA", palette: { ...palette }, headingFont: "serif", titleSize: 36, bodySize: 22 },
	email: { brand: "MASC · HYPERNOVA", palette: { ...palette }, headingFont: "serif", titleSize: 30, bodySize: 14, width: 650 },
	locales: { en: { copy: {}, purchaseBody: "", giftBody: "" }, vi: { copy: {}, purchaseBody: "", giftBody: "" } },
});
const palette = {
	background: "#07070a", surface: "#111014", border: "#38343d", text: "#f4f0e8", muted: "#c2bec6",
	accent: "#d2a66c", highlight: "#f2d584", highlightBackground: "#201c16",
	normal: "#d8d0ff", vip: "#f2d584", valid: "#bde7ad", revoked: "#ff6b62",
};

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
		const config = legacyTemplateFixture();
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
		const expected = legacyTemplateFixture();
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
