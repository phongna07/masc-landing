import { randomUUID } from "node:crypto";
import { db } from "@masc-landing/db";
import { ticketTransaction } from "@masc-landing/db/ticket-transaction";
import { admissionTickets, ticketEmailJobs, ticketOrders } from "@masc-landing/db/schema/tickets";
import { env } from "@masc-landing/env/server";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { sendMail } from "../email/send-mail";
import { ticketPng } from "./artwork";
import { renderTicketEmail } from "./email-template";

export async function runTicketEmailJobs(limit = 5) {
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
			const tickets = await db.select().from(admissionTickets).where(job.orderId ? eq(admissionTickets.orderId, job.orderId) : eq(admissionTickets.id, job.ticketId!)).orderBy(admissionTickets.ordinal);
			if (!tickets.length) throw new Error("No tickets for delivery");
			const [order] = job.orderId ? await db.select().from(ticketOrders).where(eq(ticketOrders.id, job.orderId)) : [];
			const { subject, html, text } = renderTicketEmail(tickets, order);
			const attachments = [];
			for (const ticket of tickets) attachments.push({ name: `ticket-${ticket.ordinal}.png`, content: (await ticketPng(ticket)).toString("base64"), mimeType: "image/png" });
			await sendMail({ id: job.id, from: `Ban Tổ chức MASC <${env.MAIL_USERNAME}>`, to: job.toAddress, cc: [], subject, text, html, attachments, confidential: true });
			await db.update(ticketEmailJobs).set({ status: "sent", sentAt: sql`now()`, leaseUntil: null, lastError: null }).where(and(eq(ticketEmailJobs.id, job.id), eq(ticketEmailJobs.attempts, job.attempts)));
		} catch {
			await db.update(ticketEmailJobs).set({ status: job.attempts >= 6 ? "failed" : "pending", nextAttemptAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000), leaseUntil: null, lastError: "deliveryFailed" }).where(and(eq(ticketEmailJobs.id, job.id), eq(ticketEmailJobs.attempts, job.attempts)));
		}
	}
	return { processed, runId: randomUUID() };
}
