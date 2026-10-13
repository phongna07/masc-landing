import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import sharp from "sharp";
import { renderTicketArtworkSvg, ticketPng } from "./artwork";
import { normalizeTicketTemplates, renderTicketEmail, sanitizeTicketEmailBody } from "./email-template";
import { defaultTicketTemplates, templateCopyKeys, ticketTemplateInput, type TicketEmailCopy } from "./template-input";
import { previewTicketTemplates, sampleTicketDelivery } from "./template-preview";

const copy: TicketEmailCopy = {
	...Object.fromEntries(templateCopyKeys.map(key => [key, key])) as TicketEmailCopy,
	subject: "Purchase confirmed", giftSubject: "Gift ticket", intro: "Your payment is verified.",
	giftIntro: "You received a ticket.", confidential: "Keep the QR private.", attachments: "Save your PNG attachments.",
};
const sample = (quantity = 1, source: "purchased" | "gifted" = "purchased") => sampleTicketDelivery({ category: "vip", validity: "valid", source, quantity });

test("settings reject SVG/style injection, unbounded dimensions, and invalid text overrides", () => {
	assert.ok(ticketTemplateInput.safeParse(defaultTicketTemplates).success);
	const config = structuredClone(defaultTicketTemplates);
	config.artwork.palette.background = '#000000"/><script>x</script>';
	assert.equal(ticketTemplateInput.safeParse(config).success, false);
	config.artwork.palette.background = "#000000";
	config.artwork.titleSize = 10000;
	assert.equal(ticketTemplateInput.safeParse(config).success, false);
	config.artwork.titleSize = 36;
	config.locales.en.copy.subject = "Hello\r\nBcc: someone@example.com";
	assert.equal(ticketTemplateInput.safeParse(config).success, false);
	config.locales.en.copy.subject = "Hello";
	config.locales.en.copy.valid = "x".repeat(41);
	assert.equal(ticketTemplateInput.safeParse(config).success, false);
});

test("HTML preserves rich text and removes executable markup, remote images and unsafe links", () => {
	assert.equal(sanitizeTicketEmailBody('<div onclick="x()"><b>Hello</b> <i>Alex</i><br><u>Note</u><img src="https://example.com/tracker"><script>alert(1)</script><a href="javascript:alert(1)">Bad</a><a href="https://example.com">Good</a><ul><li>One</li></ul></div>'),
		'<p><strong>Hello</strong> <em>Alex</em><br /><u>Note</u><a>Bad</a><a href="https://example.com">Good</a><ul><li>One</li></ul></p>');
	assert.equal(sanitizeTicketEmailBody(""), "");
});

test("variables must be supported, well-formed and outside HTML attributes, including encoded attributes", () => {
	for (const body of ["<p>{{unknown}}</p>", "<p>{{recipientName</p>", "<p>&#123;&#123;unknown&#125;&#125;</p>", '<a href="https://example.com/?q=>{{recipientName}}">Link</a>', '<a href="https://example.com/&#123;&#123;recipientName&#125;&#125;">Link</a>', '<p title="{{recipientName}}">Hello</p>', "<p><br></p>"]) {
		assert.throws(() => sanitizeTicketEmailBody(body), { message: "invalidTemplateBody" });
	}
	assert.equal(sanitizeTicketEmailBody('<p><a href="/relative">Relative</a><a href="//example.com">Protocol relative</a></p>'), '<p><a>Relative</a><a>Protocol relative</a></p>');
});

test("purchase email uses escaped variables and includes every ticket and the text alternative", () => {
	const config = structuredClone(defaultTicketTemplates);
	config.email.brand = "Brand & Co";
	config.email.palette.accent = "#123456";
	config.locales.en.purchaseBody = '<p>Hello <strong>{{recipientName}}</strong>, your tickets are ready.</p><ul><li>{{quantity}} tickets</li></ul><p><a href="https://example.com">Help</a></p>';
	const { tickets, order } = sample(3);
	order!.buyerName = '<img src=x onerror="x()">';
	const rendered = renderTicketEmail(tickets, order, "en", copy, config);
	assert.match(rendered.html, /&lt;img src=x onerror=/);
	assert.doesNotMatch(rendered.html, /<img|<script|PREVIEW-ONLY-4/);
	assert.match(rendered.html, /Brand &amp; Co/);
	assert.match(rendered.html, /color:#123456/);
	assert.match(rendered.text, /3 tickets/);
	assert.match(rendered.text, /Help \[https:\/\/example.com\]/);
	for (const ticket of tickets) { assert.ok(rendered.html.includes(ticket.code)); assert.ok(rendered.text.includes(ticket.code)); }
	assert.ok(rendered.text.includes(copy.confidential));
	assert.ok(rendered.text.includes(copy.attachments));
	assert.ok(rendered.text.includes("PREVIEW-ORDER"));
});

test("gift content, revoked notices and locale overrides do not affect the other locale", () => {
	const config = structuredClone(defaultTicketTemplates);
	config.locales.vi.copy = { giftSubject: "Vé tặng", revokedNotice: "Vé đã thu hồi", confidential: "Giữ bí mật mã vé" };
	config.locales.vi.giftBody = "<p>{{recipientName}} · {{orderId}}{{packageName}}{{total}}</p>";
	const { tickets } = sample(1, "gifted");
	tickets[0]!.validity = "revoked";
	const vi = renderTicketEmail(tickets, undefined, "vi", copy, config);
	assert.match(vi.subject, /^Vé tặng/);
	assert.match(vi.text, /Vé đã thu hồi/);
	assert.match(vi.text, /Giữ bí mật mã vé/);
	assert.doesNotMatch(vi.text, /PREVIEW-ORDER|199/);
	const en = renderTicketEmail(tickets, undefined, "en", copy, config);
	assert.match(en.subject, /^Gift ticket/);
	assert.ok(en.text.includes(copy.giftIntro));
	assert.ok(en.text.includes(copy.revokedNotice));
});

test("normalization handles both languages and both delivery types without mutating the draft", () => {
	const draft = structuredClone(defaultTicketTemplates);
	draft.locales.en.purchaseBody = "<div><b>Hello</b></div>";
	draft.locales.vi.giftBody = "<p>Xin chào<img src=x></p>";
	const normalized = normalizeTicketTemplates(draft);
	assert.equal(normalized.locales.en.purchaseBody, "<p><strong>Hello</strong></p>");
	assert.equal(normalized.locales.vi.giftBody, "<p>Xin chào</p>");
	assert.equal(draft.locales.en.purchaseBody, "<div><b>Hello</b></div>");
	draft.locales.vi.purchaseBody = "<p>{{notSupported}}</p>";
	assert.throws(() => normalizeTicketTemplates(draft), { message: "invalidTemplateBody" });
});

test("artwork expands for long text, escapes SVG text, and keeps the QR bitmap identical across themes", async () => {
	const { tickets } = sample();
	const ticket = tickets[0]!;
	const config = structuredClone(defaultTicketTemplates);
	config.artwork.brand = '<Brand & Co>';
	config.artwork.titleSize = 48;
	config.artwork.bodySize = 26;
	config.artwork.palette.background = "#ffffff";
	config.locales.vi.copy.confidential = "Giữ bí mật mã vé. ".repeat(20);
	const baseline = renderTicketArtworkSvg(ticket, "vi", copy);
	const updated = renderTicketArtworkSvg(ticket, "vi", copy, config);
	assert.match(updated.svg, /&lt;Brand &amp; Co&gt;/);
	assert.doesNotMatch(updated.svg, /<Brand/);
	const defaultPng = await ticketPng(ticket, "vi", copy);
	const customPng = await ticketPng(ticket, "vi", copy, config);
	const defaultMeta = await sharp(defaultPng).metadata();
	const customMeta = await sharp(customPng).metadata();
	assert.equal(customMeta.width, 900);
	assert.ok(customMeta.height! > defaultMeta.height!);
	const cropQr = (png: Buffer, top: number) => sharp(png).extract({ left: 190, top, width: 520, height: 520 }).removeAlpha().raw().toBuffer();
	assert.deepEqual(await cropQr(defaultPng, baseline.qrTop), await cropQr(customPng, updated.qrTop));
	const originalQr = await QRCode.toBuffer(ticket.code, { type: "png", errorCorrectionLevel: "M", width: 520, margin: 4, color: { dark: "#000000", light: "#ffffff" } });
	assert.deepEqual(await cropQr(customPng, updated.qrTop), await sharp(originalQr).removeAlpha().raw().toBuffer());
});

test("previews render the same email and PNG as delivery using unusable credentials", async () => {
	const input = { config: structuredClone(defaultTicketTemplates), locale: "en" as const, category: "normal" as const, validity: "valid" as const, source: "purchased" as const, quantity: 2 };
	const result = await previewTicketTemplates(input, copy);
	const { tickets, order } = sampleTicketDelivery(input);
	assert.deepEqual({ subject: result.subject, html: result.html, text: result.text }, renderTicketEmail(tickets, order, input.locale, copy, result.config));
	assert.equal(result.png, `data:image/png;base64,${(await ticketPng(tickets[0]!, input.locale, copy, result.config)).toString("base64")}`);
	for (const ticket of tickets) assert.doesNotMatch(ticket.code, /^[A-HJ-NP-Z2-9]{20}$/);
});

// Old records must never reintroduce removed metadata in delivery output.
test("legacy event metadata is absent from artwork, email subjects, HTML and text", () => {
	for (const locale of ["en", "vi"] as const) for (const source of ["purchased", "gifted"] as const) {
		const { tickets, order } = sample(1, source);
		const event = { name: "REMOVED-EVENT", date: "2026-11-01T03:00:00Z", venue: "REMOVED-VENUE", timezone: "REMOVED-TIMEZONE" };
		Object.assign(tickets[0]!, { event });
		if (order) Object.assign(order.snapshot, { event });
		const email = renderTicketEmail(tickets, order, locale, copy, defaultTicketTemplates);
		assert.equal(email.subject, source === "purchased" ? copy.subject : copy.giftSubject);
		for (const output of [email.subject, email.html, email.text, renderTicketArtworkSvg(tickets[0]!, locale, copy).svg]) {
			assert.doesNotMatch(output, /REMOVED-|2026|dateUnknown|venueUnknown/);
			assert.ok(output.includes(tickets[0]!.code) || output === email.subject);
		}
	}
});

test("removed event variables and copy overrides cannot be saved", () => {
	for (const variable of ["eventName", "eventDate", "venue"]) {
		assert.throws(() => sanitizeTicketEmailBody(`<p>{{${variable}}}</p>`), { message: "invalidTemplateBody" });
	}
	for (const key of ["dateUnknown", "venueUnknown"]) {
		const config = structuredClone(defaultTicketTemplates);
		Object.assign(config.locales.en.copy, { [key]: "Obsolete" });
		assert.equal(ticketTemplateInput.safeParse(config).success, false);
	}
});
