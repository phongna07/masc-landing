import { randomUUID } from "node:crypto";
import { db } from "@masc-landing/db";
import { admissionTickets, salesLogs, salesLogEmailAttempts } from "@masc-landing/db/schema/tickets";
import { ticketTransaction } from "@masc-landing/db/ticket-transaction";
import { env } from "@masc-landing/env/server";
import { and, eq, sql } from "drizzle-orm";
import { sendMail } from "../email/send-mail";
import { audit, ticketError } from "./core";
import { ticketPng } from "./artwork";
import { renderTicketEmail } from "./email-template";
import { accessibleSalesLog, publicSalesLog, type SalesActor } from "./sales-logs";

export async function sendSalesLogEmail(id: string, actor: SalesActor, requestKey: string, initial = false) {
	await accessibleSalesLog(id, actor);
	const claim = await ticketTransaction(async tx => {
		const [log] = await tx.select().from(salesLogs).where(eq(salesLogs.id, id)).for("update");
		if (!log || (!actor.isRoot && log.createdBy !== actor.id)) ticketError("notFound", "NOT_FOUND");
		const [previous] = await tx.select().from(salesLogEmailAttempts).where(and(eq(salesLogEmailAttempts.salesLogId, id), eq(salesLogEmailAttempts.requestKey, requestKey)));
		if (previous || (initial && log.emailStatus !== "pending")) return null;
		const active = log.emailStatus === "sending" && log.emailLeaseUntil && log.emailLeaseUntil.getTime() > Date.now();
		if (active) ticketError("emailSending", "CONFLICT");
		if (!actor.isRoot && log.emailStatus === "sent") ticketError("emailAlreadySent", "CONFLICT");
		if (log.emailStatus === "sending" && log.emailAttemptId) {
			await tx.update(salesLogEmailAttempts).set({ status: "failed", error: "deliveryUncertain", finishedAt: sql`now()` }).where(eq(salesLogEmailAttempts.id, log.emailAttemptId));
		}
		const attemptId = randomUUID();
		await tx.insert(salesLogEmailAttempts).values({ id: attemptId, salesLogId: id, requestKey, actorId: actor.id, status: "sending" });
		await tx.update(salesLogs).set({ emailStatus: "sending", emailAttemptId: attemptId, emailLeaseUntil: sql`now() + interval '5 minutes'` }).where(eq(salesLogs.id, id));
		return { log, attemptId };
	});
	if (!claim) return publicSalesLog(await accessibleSalesLog(id, actor));
	let sent = false;
	try {
		const tickets = await db.select().from(admissionTickets).where(eq(admissionTickets.salesLogId, id)).orderBy(admissionTickets.ordinal);
		if (tickets.length !== claim.log.quantity) throw new Error("Incomplete delivery");
		const message = renderTicketEmail(tickets, undefined, claim.log);
		const attachments = [];
		for (const ticket of tickets) attachments.push({ name: `ticket-${ticket.ordinal}.png`, content: (await ticketPng(ticket)).toString("base64"), mimeType: "image/png" });
		// Do not send after losing the lease while rendering a large group of tickets.
		const current = await accessibleSalesLog(id, actor);
		if (current.emailAttemptId !== claim.attemptId || !current.emailLeaseUntil || current.emailLeaseUntil.getTime() <= Date.now()) throw new Error("Delivery lease expired");
		await sendMail({ id: claim.attemptId, from: `Ban Tổ chức MASC <${env.MAIL_USERNAME}>`, to: claim.log.buyerEmail, cc: [], ...message, attachments, confidential: true });
		sent = true;
	} catch { /* Return persisted delivery status, never roll back issuance or expose provider errors. */ }
	await ticketTransaction(async tx => {
		const [updated] = await tx.update(salesLogs).set({ emailStatus: sent ? "sent" : "failed", emailLeaseUntil: null, ...(sent ? { emailSentAt: sql`now()` } : {}) }).where(and(eq(salesLogs.id, id), eq(salesLogs.emailAttemptId, claim.attemptId))).returning({ id: salesLogs.id });
		if (!updated) return;
		await tx.update(salesLogEmailAttempts).set({ status: sent ? "sent" : "failed", error: sent ? null : "deliveryFailed", finishedAt: sql`now()` }).where(eq(salesLogEmailAttempts.id, claim.attemptId));
		await audit(tx, actor.id, sent ? "salesEmailSent" : "salesEmailFailed", id, null, sent ? "success" : "failure");
	});
	return publicSalesLog(await accessibleSalesLog(id, actor));
}
