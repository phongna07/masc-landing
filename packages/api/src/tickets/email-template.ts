import { htmlToText } from "html-to-text";
import { renderEmailLayout } from "../email/email-layout";
import type { Order, Ticket } from "./core";
import { escapeXml } from "./artwork";
import { ticketTemplateCopy } from "./template-input";

export function renderTicketEmail(tickets: Ticket[], order: Order | undefined) {
	if (!tickets.length) throw new Error("No tickets for delivery");
	const copy = ticketTemplateCopy;
	const total = order ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(order.snapshot.totalPrice) : "";
	const bodyHtml = `<p>${escapeXml(order ? copy.intro : copy.giftIntro)}</p>`;
	const lines: string[] = [copy.confidential, copy.attachments];
	if (order) lines.push(`${copy.order}: ${order.id}`, `${copy.package}: ${order.snapshot.packageName}`, `${copy.quantity}: ${order.snapshot.quantity}`, `${copy.total}: ${total}`);
	if (tickets.some(ticket => ticket.validity === "revoked")) lines.push(copy.revokedNotice);
	const heading = order ? copy.subject : copy.giftSubject;
	const subject = heading.replace(/[\r\n]+/g, " ");
	const contentHtml = `<h1 class="ticket-heading">${escapeXml(heading)}</h1>${bodyHtml}${lines.map((line, index) => `<p${index === 0 ? ' class="ticket-notice"' : ""}>${escapeXml(line)}</p>`).join("")}`;
	return {
		subject,
		...renderEmailLayout({
			subject,
			contentHtml,
			contentText: [htmlToText(bodyHtml, { wordwrap: false }), ...lines].join("\n\n"),
			styles: `
        .ticket-heading { margin: 0 0 20px; color: #5d3593; font-size: 24px; line-height: 1.3; }
        .content { overflow-wrap: anywhere; }
        .ticket-notice { padding: 14px; border: 1px solid #5d3593; background-color: #f5f0fa; }
        `,
		}),
	};
}
