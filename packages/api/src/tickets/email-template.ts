import { TRPCError } from "@trpc/server";
import { htmlToText } from "html-to-text";
import sanitizeHtml from "sanitize-html";
import type { TicketTemplateConfig } from "@masc-landing/db/schema/ticket-templates";
import type { Order, Ticket } from "./core";
import { escapeXml } from "./artwork";
import { emailTemplateVariables, templateHeadingFont, ticketTemplateCopy, ticketTemplateInput, type TicketEmailCopy } from "./template-input";

const placeholderPattern = /{{\s*([a-zA-Z]+)\s*}}/g;
export function sanitizeTicketEmailBody(body: string) {
	if (!body.trim()) return "";
	const invalid = () => { throw new TRPCError({ code: "BAD_REQUEST", message: "invalidTemplateBody" }); };
	const validateVariables = (value: string) => {
		const withoutVariables = value.replace(placeholderPattern, (_match, name: string) => {
			if (!(emailTemplateVariables as readonly string[]).includes(name)) invalid();
			return "";
		});
		if (withoutVariables.includes("{{") || withoutVariables.includes("}}")) invalid();
	};
	validateVariables(body);
	// Parse attributes rather than scanning tags with a regex: '>' may occur in
	// quoted attribute values. Dynamic values belong exclusively in text nodes.
	const sanitized = sanitizeHtml(body, {
		allowedTags: ["p", "br", "strong", "em", "u", "a", "ul", "ol", "li"],
		allowedAttributes: { a: ["href"] },
		allowedSchemes: ["https", "http", "mailto"],
		allowProtocolRelative: false,
		transformTags: {
			"*": (tagName, attribs) => {
				if (Object.values(attribs).some(value => value.includes("{{") || value.includes("}}"))) invalid();
				if (tagName === "a" && attribs.href) {
					try {
						const url = new URL(attribs.href);
						if (!(url.protocol === "mailto:" ? !!url.pathname : ["http:", "https:"].includes(url.protocol) && !!url.hostname)) delete attribs.href;
					} catch { delete attribs.href; }
				}
				return { tagName: ({ div: "p", b: "strong", i: "em" } as Record<string, string>)[tagName] ?? tagName, attribs };
			},
		},
	});
	// Entity decoding can reveal braces absent from the original source.
	validateVariables(sanitized);
	if (sanitized.length > 20_000 || !htmlToText(sanitized, { wordwrap: false }).trim()) invalid();
	return sanitized;
}

export function normalizeTicketTemplates(input: TicketTemplateConfig): TicketTemplateConfig {
	const config = ticketTemplateInput.parse(input);
	for (const locale of ["en", "vi"] as const) {
		config.locales[locale].purchaseBody = sanitizeTicketEmailBody(config.locales[locale].purchaseBody);
		config.locales[locale].giftBody = sanitizeTicketEmailBody(config.locales[locale].giftBody);
	}
	return config;
}

export function renderTicketEmail(tickets: Ticket[], order: Order | undefined, locale: "en" | "vi", baseCopy: TicketEmailCopy, config: TicketTemplateConfig) {
	if (!tickets.length) throw new Error("No tickets for delivery");
	const copy = ticketTemplateCopy(baseCopy, config, locale);
	const first = tickets[0]!;
	const total = order ? new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(order.snapshot.totalPrice) : "";
	const values = {
		recipientName: order?.buyerName ?? first.recipientName ?? "",
		orderId: order?.id ?? "", packageName: order?.snapshot.packageName ?? "", quantity: String(tickets.length), total,
	};
	const template = order ? config.locales[locale].purchaseBody : config.locales[locale].giftBody;
	const bodyHtml = template ? sanitizeTicketEmailBody(template).replace(placeholderPattern, (_match, name: keyof typeof values) => escapeXml(values[name])) : `<p>${escapeXml(order ? copy.intro : copy.giftIntro)}</p>`;
	const lines = [copy.confidential, copy.attachments];
	if (order) lines.push(`${copy.order}: ${order.id}`, `${copy.package}: ${order.snapshot.packageName}`, `${copy.quantity}: ${order.snapshot.quantity}`, `${copy.total}: ${total}`);
	for (const ticket of tickets) {
		lines.push(copy[ticket.category], `${copy.code}: ${ticket.code}`, `${copy.validity}: ${copy[ticket.validity]}`, ...ticket.benefits.map(() => copy.networkingLunch));
		if (ticket.validity === "revoked") lines.push(copy.revokedNotice);
	}
	const heading = order ? copy.subject : copy.giftSubject;
	const subject = heading.replace(/[\r\n]+/g, " ");
	const { palette: p, brand, titleSize, bodySize, width, headingFont } = config.email;
	const paragraphStyle = `margin:0 0 16px;font-size:${bodySize}px;line-height:1.7;overflow-wrap:anywhere;`;
	// Inline styles also cover rich-text fragments, including lists and links.
	// The surrounding table and mandatory credential/instruction block stay intact.
	const styledBody = sanitizeHtml(bodyHtml, {
		allowedTags: ["p", "br", "strong", "em", "u", "a", "ul", "ol", "li"], allowedAttributes: { "*": ["style"], a: ["href", "style"] },
		allowedSchemes: ["https", "http", "mailto"], allowProtocolRelative: false,
		transformTags: {
			"*": (tagName, attribs) => ({ tagName, attribs: { ...attribs, style: tagName === "a" ? `color:${p.accent};text-decoration:underline` :
				["ul", "ol"].includes(tagName) ? `${paragraphStyle}padding-left:26px;color:${p.muted}` : tagName === "p" ? `${paragraphStyle}color:${p.muted}` : `font-size:${bodySize}px;line-height:1.7` } }),
		},
	});
	const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeXml(subject)}</title></head><body style="margin:0;padding:24px 12px;background:${p.background};color:${p.text};font-family:Arial,sans-serif">
		<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${width}px;border:1px solid ${p.border};background:${p.surface}">
		<tr><td style="padding:28px 28px 16px;border-bottom:1px solid ${p.border}"><p style="margin:0 0 16px;color:${p.accent};font-size:11px;font-weight:bold;letter-spacing:3px">${escapeXml(brand)}</p><h1 style="margin:0;color:${p.text};font-family:${templateHeadingFont(headingFont)};font-size:${titleSize}px;font-weight:normal;line-height:1.2;overflow-wrap:anywhere">${escapeXml(heading)}</h1></td></tr>
		<tr><td style="padding:28px">${styledBody}${lines.map((line, index) => `<p style="${paragraphStyle}${index === 0 ? `padding:14px;border:1px solid ${p.accent};background:${p.highlightBackground};color:${p.highlight}` : `color:${p.muted}`}">${escapeXml(line)}</p>`).join("")}</td></tr>
		</table></td></tr></table></body></html>`;
	return { subject, html, text: [htmlToText(bodyHtml, { wordwrap: false }), ...lines].join("\n\n") };
}
