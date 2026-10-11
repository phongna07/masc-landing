import { randomUUID } from "node:crypto";
import { db } from "@masc-landing/db";
import { ticketTransaction } from "@masc-landing/db/ticket-transaction";
import { admissionTickets, ticketEmailJobs, ticketOrders } from "@masc-landing/db/schema/tickets";
import { env } from "@masc-landing/env/server";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { sendMail } from "../email/send-mail";
import { escapeXml, ticketPng, type ArtworkCopy } from "./artwork";

export type TicketEmailCopy = ArtworkCopy & { subject: string; giftSubject: string; intro: string; giftIntro: string; attachments: string; package: string; quantity: string; total: string; order: string; revokedNotice: string };

export async function runTicketEmailJobs(messages: Record<"en" | "vi", TicketEmailCopy>, limit = 5) {
	let processed = 0;
	for (let i = 0; i < limit; i++) {
		const job = await ticketTransaction(async tx => {
			const [due] = await tx.select().from(ticketEmailJobs).where(and(
				inArray(ticketEmailJobs.status, ["pending", "sending"]), lte(ticketEmailJobs.nextAttemptAt, sql`now()`),
				or(isNull(ticketEmailJobs.leaseUntil), lte(ticketEmailJobs.leaseUntil, sql`now()`)),
			)).orderBy(ticketEmailJobs.nextAttemptAt).limit(1).for("update", { skipLocked: true });
			if (!due) return null;
			const [claimed] = await tx.update(ticketEmailJobs).set({ status: "sending", attempts: due.attempts + 1, leaseUntil: sql`now() + interval '5 minutes'` }).where(eq(ticketEmailJobs.id, due.id)).returning();
			return claimed!;
		});
		if (!job) break;
		processed++;
		try {
			const copy = messages[job.locale];
			const tickets = await db.select().from(admissionTickets).where(job.orderId ? eq(admissionTickets.orderId, job.orderId) : eq(admissionTickets.id, job.ticketId!)).orderBy(admissionTickets.ordinal);
			if (!tickets.length) throw new Error("No tickets for delivery");
			const [order] = job.orderId ? await db.select().from(ticketOrders).where(eq(ticketOrders.id, job.orderId)) : [];
			const lines = [order ? copy.intro : copy.giftIntro, copy.confidential, copy.attachments];
			if (order) lines.push(`${copy.order}: ${order.id}`, `${copy.package}: ${order.snapshot.packageName}`, `${copy.quantity}: ${order.snapshot.quantity}`, `${copy.total}: ${new Intl.NumberFormat(job.locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(order.snapshot.totalPrice)}`);
			for (const ticket of tickets) {
				const date = ticket.event.date ? new Intl.DateTimeFormat(job.locale, { dateStyle: "full", timeStyle: "short", timeZone: ticket.event.timezone }).format(new Date(ticket.event.date)) : copy.dateUnknown;
				lines.push(ticket.event.name, `${date} (${ticket.event.timezone})`, ticket.event.venue || copy.venueUnknown, copy[ticket.category], `${copy.code}: ${ticket.code}`, `${copy.validity}: ${copy[ticket.validity]}`, ...ticket.benefits.map(() => copy.networkingLunch));
				if (ticket.validity === "revoked") lines.push(copy.revokedNotice);
			}
			const attachments = [];
			for (const ticket of tickets) attachments.push({ name: `ticket-${ticket.ordinal}.png`, content: (await ticketPng(ticket, job.locale, copy)).toString("base64"), mimeType: "image/png" });
			const subject = `${order ? copy.subject : copy.giftSubject} — ${tickets[0]!.event.name}`;
			// Inline styles and table layout preserve the site's charcoal/ivory/gold
			// branding in mail clients without loading any public credential images.
			const html = `<!doctype html><html lang="${job.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeXml(subject)}</title></head><body style="margin:0;padding:24px 12px;background:#07070a;color:#f4f0e8;font-family:Arial,sans-serif">
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:650px;border:1px solid #38343d;background:#111014">
				<tr><td style="padding:28px 28px 16px;border-bottom:1px solid #38343d"><p style="margin:0 0 16px;color:#d2a66c;font-size:11px;font-weight:bold;letter-spacing:3px">MASC · HYPERNOVA</p><h1 style="margin:0;color:#f4f0e8;font-family:Georgia,serif;font-size:30px;font-weight:normal;line-height:1.2">${escapeXml(order ? copy.subject : copy.giftSubject)}</h1><p style="margin:14px 0 0;color:#c2bec6;font-size:14px;line-height:1.6">${escapeXml(tickets[0]!.event.name)}</p></td></tr>
				<tr><td style="padding:28px">${lines.map((line, index) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.7;overflow-wrap:anywhere;${index === 1 ? "padding:14px;border:1px solid #705d3e;background:#201c16;color:#f2d584" : "color:#c2bec6"}">${escapeXml(line)}</p>`).join("")}</td></tr>
				</table></td></tr></table></body></html>`;
			await sendMail({ id: job.id, from: env.MAIL_USERNAME, to: job.toAddress, cc: [], subject, text: lines.join("\n\n"), html, attachments, confidential: true });
			await db.update(ticketEmailJobs).set({ status: "sent", sentAt: sql`now()`, leaseUntil: null, lastError: null }).where(and(eq(ticketEmailJobs.id, job.id), eq(ticketEmailJobs.attempts, job.attempts)));
		} catch {
			await db.update(ticketEmailJobs).set({ status: job.attempts >= 6 ? "failed" : "pending", nextAttemptAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000), leaseUntil: null, lastError: "deliveryFailed" }).where(and(eq(ticketEmailJobs.id, job.id), eq(ticketEmailJobs.attempts, job.attempts)));
		}
	}
	return { processed, runId: randomUUID() };
}
