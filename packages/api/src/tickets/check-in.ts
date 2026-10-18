import { randomUUID } from "node:crypto";
import { db } from "@masc-landing/db";
import { ticketTransaction } from "@masc-landing/db/ticket-transaction";
import { admissionTickets, ticketCheckIns, ticketCredentials, ticketOrders } from "@masc-landing/db/schema/tickets";
import { and, desc, eq, sql } from "drizzle-orm";
import { codePattern, hashCode, rateLimit, ticketError } from "./core";

export async function lookupTicket(actorId: string, rawCode: string, requestKey: string) {
	await rateLimit(actorId, "admission-lookup", 30);
	const code = rawCode.trim().toUpperCase();
	const [ticket] = codePattern.test(code) ? await db.select({
		id: admissionTickets.id, code: admissionTickets.code, category: admissionTickets.category, validity: admissionTickets.validity,
		recipientName: sql<string | null>`coalesce(${admissionTickets.recipientName}, ${ticketOrders.buyerName})`,
		recipientPhone: sql<string | null>`coalesce(${admissionTickets.recipientPhone}, ${ticketOrders.buyerPhone})`,
		acceptedCount: admissionTickets.acceptedCount, benefits: admissionTickets.benefits, credentialVersion: admissionTickets.credentialVersion,
	}).from(admissionTickets).leftJoin(ticketOrders, eq(admissionTickets.orderId, ticketOrders.id)).where(eq(admissionTickets.code, code)) : [];
	if (!ticket) {
		const [credential] = codePattern.test(code) ? await db.select().from(ticketCredentials).where(eq(ticketCredentials.codeHash, hashCode(code))) : [];
		const reason = credential ? "replaced" : "notFound";
		await db.insert(ticketCheckIns).values({ id: randomUUID(), actorId, requestKey, ticketId: credential?.ticketId ?? null, outcome: "rejected", reason }).onConflictDoNothing();
		return { outcome: reason, ticket: null, history: [] };
	}
	if (ticket.validity === "revoked" || ticket.acceptedCount > 0) {
		await db.insert(ticketCheckIns).values({ id: randomUUID(), actorId, requestKey, ticketId: ticket.id, outcome: "rejected", reason: ticket.validity === "revoked" ? "revoked" : "alreadyAdmitted" }).onConflictDoNothing();
	}
	// A flood of rejected scans must never hide prior accepted admission times.
	const recent = (outcome: "accepted" | "rejected") => db.select({ id: ticketCheckIns.id, outcome: ticketCheckIns.outcome, reason: ticketCheckIns.reason, isOverride: ticketCheckIns.isOverride, createdAt: ticketCheckIns.createdAt }).from(ticketCheckIns).where(and(eq(ticketCheckIns.ticketId, ticket.id), eq(ticketCheckIns.outcome, outcome))).orderBy(desc(ticketCheckIns.createdAt)).limit(100);
	const [accepted, rejected] = await Promise.all([recent("accepted"), recent("rejected")]);
	const history = [...accepted, ...rejected].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	return { outcome: ticket.validity === "revoked" ? "revoked" : ticket.acceptedCount > 0 ? "alreadyAdmitted" : "ready", ticket, history };
}

export async function confirmCheckIn(input: { ticketId: string; credentialVersion: number; requestKey: string; overrideReason?: string }, actorId: string, isRoot: boolean) {
	await rateLimit(actorId, "admission-confirm", 30);
	if (input.overrideReason && !isRoot) ticketError("overrideForbidden", "FORBIDDEN");
	return ticketTransaction(async tx => {
		const [ticket] = await tx.select().from(admissionTickets).where(eq(admissionTickets.id, input.ticketId)).for("update");
		if (!ticket) ticketError("notFound", "NOT_FOUND");
		const [previous] = await tx.select().from(ticketCheckIns).where(and(eq(ticketCheckIns.actorId, actorId), eq(ticketCheckIns.requestKey, input.requestKey)));
		if (previous) {
			if (previous.ticketId !== ticket.id) ticketError("requestChanged", "CONFLICT");
			return { ...previous, acceptedCount: ticket.acceptedCount };
		}
		const isOverride = isRoot && Boolean(input.overrideReason?.trim());
		const rejected = ticket.credentialVersion !== input.credentialVersion ? "replaced" : ticket.validity !== "valid" ? "revoked" : ticket.acceptedCount > 0 && !isOverride ? "alreadyAdmitted" : null;
		const [event] = await tx.insert(ticketCheckIns).values({
			id: randomUUID(), ticketId: ticket.id, actorId, requestKey: input.requestKey,
			outcome: rejected ? "rejected" : "accepted", isOverride: !rejected && isOverride,
			reason: rejected ?? (isOverride ? input.overrideReason!.trim().replace(/[A-HJ-NP-Z2-9]{20}/gi, "[REDACTED]") : "firstAdmission"),
		}).returning();
		if (!rejected) await tx.update(admissionTickets).set({ acceptedCount: sql`${admissionTickets.acceptedCount} + 1` }).where(eq(admissionTickets.id, ticket.id));
		return { ...event!, acceptedCount: ticket.acceptedCount + (rejected ? 0 : 1) };
	});
}
