import { htmlToText } from "html-to-text";
import type { Order, Ticket } from "./core";
import { escapeXml } from "./artwork";
import { ticketTemplateAppearance, ticketTemplatePalette, ticketTemplateCopy } from "./template-input";

export function renderTicketEmail(tickets: Ticket[], order: Order | undefined) {
	if (!tickets.length) throw new Error("No tickets for delivery");
	const copy = ticketTemplateCopy;
	const total = order ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(order.snapshot.totalPrice) : "";
	const bodyHtml = `<p>${escapeXml(order ? copy.intro : copy.giftIntro)}</p>`;
	const lines: string[] = [copy.confidential, copy.attachments];
	if (order) lines.push(`${copy.order}: ${order.id}`, `${copy.package}: ${order.snapshot.packageName}`, `${copy.quantity}: ${order.snapshot.quantity}`, `${copy.total}: ${total}`);
	for (const ticket of tickets) {
		lines.push(copy[ticket.category], `${copy.code}: ${ticket.code}`, `${copy.validity}: ${copy[ticket.validity]}`, ...ticket.benefits.map(() => copy.networkingLunch));
		if (ticket.validity === "revoked") lines.push(copy.revokedNotice);
	}
	const heading = order ? copy.subject : copy.giftSubject;
	const subject = heading.replace(/[\r\n]+/g, " ");
	const p = ticketTemplatePalette;
	const { brand, titleSize, bodySize, width, headingFont } = ticketTemplateAppearance.email;
	const paragraphStyle = `margin:0 0 16px;font-size:${bodySize}px;line-height:1.7;overflow-wrap:anywhere;`;
	const styledBody = `<p style="${paragraphStyle}color:${p.muted}">${escapeXml(order ? copy.intro : copy.giftIntro)}</p>`;
	// Gmail requires "light only" to disable automatic color inversion, even for
	// an already-dark design. Preserve the authored palette in both display modes.
	// https://emailmarkup.org/en/blog/2026/gmail-app-dark-mode-update
	const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><style>:root { color-scheme: only light; }</style><title>${escapeXml(subject)}</title></head><body style="margin:0;padding:24px 12px;background:${p.background};color:${p.text};font-family:Arial,sans-serif">
		<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:${width}px;border:1px solid ${p.border};background:${p.surface}">
		<tr><td style="padding:28px 28px 16px;border-bottom:1px solid ${p.border}"><p style="margin:0 0 16px;color:${p.accent};font-size:11px;font-weight:bold;letter-spacing:3px">${escapeXml(brand)}</p><h1 style="margin:0;color:${p.text};font-family:${headingFont};font-size:${titleSize}px;font-weight:normal;line-height:1.2;overflow-wrap:anywhere">${escapeXml(heading)}</h1></td></tr>
		<tr><td style="padding:28px">${styledBody}${lines.map((line, index) => `<p style="${paragraphStyle}${index === 0 ? `padding:14px;border:1px solid ${p.accent};background:${p.highlightBackground};color:${p.highlight}` : `color:${p.muted}`}">${escapeXml(line)}</p>`).join("")}</td></tr>
		</table></td></tr></table></body></html>`;
	return { subject, html, text: [htmlToText(bodyHtml, { wordwrap: false }), ...lines].join("\n\n") };
}
