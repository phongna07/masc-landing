import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import sharp from "sharp";
import { renderTicketArtworkSvg, ticketPng } from "./artwork";
import { renderTicketEmail } from "./email-template";
import { previewTicketTemplatesInput, ticketTemplateCopy as copy, ticketTemplatePalette } from "./template-input";
import { previewTicketTemplates, sampleTicketDelivery } from "./template-preview";

const sample = (quantity = 1, source: "purchased" | "gifted" = "purchased") => sampleTicketDelivery({ category: "vip", validity: "valid", source, quantity });

test("preview input accepts sample choices and rejects all configuration overrides", () => {
	const input = { category: "normal", validity: "valid", source: "purchased", quantity: 2 };
	assert.ok(previewTicketTemplatesInput.safeParse(input).success);
	for (const override of [{ config: {} }, { copy: { subject: "Override" } }, { purchaseBody: "<p>Override</p>" }, { locale: "en" }]) {
		assert.equal(previewTicketTemplatesInput.safeParse({ ...input, ...override }).success, false);
	}
	for (const quantity of [0, 4, 1.5]) assert.equal(previewTicketTemplatesInput.safeParse({ ...input, quantity }).success, false);
});

test("purchase emails escape order data and include every ticket and Vietnamese instructions", () => {
	const { tickets, order } = sample(3);
	order!.snapshot.packageName = '<img src=x onerror="x()"> & VIP';
	const rendered = renderTicketEmail(tickets, order);
	assert.match(rendered.html, /&lt;img src=x onerror=/);
	assert.doesNotMatch(rendered.html, /<img|<script|PREVIEW-ONLY-4/);
	assert.equal(rendered.subject, copy.subject);
	assert.match(rendered.html, /lang="vi"/);
	assert.ok(rendered.html.includes(`color:${ticketTemplatePalette.accent}`));
	for (const ticket of tickets) {
		assert.ok(rendered.html.includes(ticket.code));
		assert.ok(rendered.text.includes(ticket.code));
	}
	for (const text of [copy.intro, copy.confidential, copy.attachments, "PREVIEW-ORDER", `${copy.quantity}: 3`]) assert.ok(rendered.text.includes(text));
});

test("gift emails use fixed Vietnamese content and include revoked warnings without order details", () => {
	const { tickets } = sample(1, "gifted");
	tickets[0]!.validity = "revoked";
	const rendered = renderTicketEmail(tickets, undefined);
	assert.equal(rendered.subject, copy.giftSubject);
	for (const text of [copy.giftIntro, copy.revokedNotice, copy.confidential, copy.revoked]) assert.ok(rendered.text.includes(text));
	assert.doesNotMatch(rendered.text, /PREVIEW-ORDER|199/);
});

test("artwork escapes ticket codes and preserves the exact admission QR bitmap", async () => {
	const { tickets } = sample();
	const ticket = tickets[0]!;
	const malicious = renderTicketArtworkSvg({ ...ticket, code: '<script> & "code"' });
	assert.match(malicious.svg, /&lt;script&gt; &amp; &quot;code&quot;/);
	assert.doesNotMatch(malicious.svg, /<script>/);
	const { svg, qrTop } = renderTicketArtworkSvg(ticket);
	for (const label of [copy.vip, copy.networkingLunch, copy.admissionQr]) assert.ok(svg.includes(label));
	const png = await ticketPng(ticket);
	const metadata = await sharp(png).metadata();
	assert.equal(metadata.width, 900);
	const crop = await sharp(png).extract({ left: 190, top: qrTop, width: 520, height: 520 }).removeAlpha().raw().toBuffer();
	const original = await QRCode.toBuffer(ticket.code, { type: "png", errorCorrectionLevel: "M", width: 520, margin: 4, color: { dark: "#000000", light: "#ffffff" } });
	assert.deepEqual(crop, await sharp(original).removeAlpha().raw().toBuffer());
});

test("all preview scenarios match delivery output and use unusable admission credentials", async () => {
	for (const category of ["normal", "vip"] as const) {
		for (const source of ["purchased", "gifted"] as const) {
			for (const validity of ["valid", "revoked"] as const) {
				const input = { category, source, validity, quantity: 2 };
				const result = await previewTicketTemplates(input);
				const { tickets, order } = sampleTicketDelivery(input);
				assert.equal(tickets.length, source === "gifted" ? 1 : 2);
				assert.deepEqual({ subject: result.subject, html: result.html, text: result.text }, renderTicketEmail(tickets, order));
				assert.equal(result.png, `data:image/png;base64,${(await ticketPng(tickets[0]!)).toString("base64")}`);
				assert.ok(result.text.includes(copy[category]));
				assert.ok(result.text.includes(copy[validity]));
				assert.equal(result.text.includes(copy.networkingLunch), category === "vip");
				for (const ticket of tickets) assert.doesNotMatch(ticket.code, /^[A-HJ-NP-Z2-9]{20}$/);
			}
		}
	}
});

test("legacy event metadata is absent from all outputs and English orders still render Vietnamese", () => {
	for (const source of ["purchased", "gifted"] as const) {
		const { tickets, order } = sample(1, source);
		const event = { name: "REMOVED-EVENT", date: "2026-11-01T03:00:00Z", venue: "REMOVED-VENUE", timezone: "REMOVED-TIMEZONE" };
		Object.assign(tickets[0]!, { event });
		if (order) {
			order.locale = "en";
			Object.assign(order.snapshot, { event });
		}
		const email = renderTicketEmail(tickets, order);
		assert.equal(email.subject, source === "purchased" ? copy.subject : copy.giftSubject);
		for (const output of [email.subject, email.html, email.text, renderTicketArtworkSvg(tickets[0]!).svg]) {
			assert.doesNotMatch(output, /REMOVED-|2026|dateUnknown|venueUnknown/);
			assert.ok(output.includes(tickets[0]!.code) || output === email.subject);
		}
		if (order) assert.ok(email.text.includes(new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(order.snapshot.totalPrice)));
	}
});
