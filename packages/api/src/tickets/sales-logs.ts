import { randomUUID } from "node:crypto";
import { db } from "@masc-landing/db";
import { admissionTickets, salesLogs, salesLogEmailAttempts, ticketAudit } from "@masc-landing/db/schema/tickets";
import { ticketTransaction } from "@masc-landing/db/ticket-transaction";
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, issueTicket, lockSales, releaseExpiredReservations, ticketError, vipUsage } from "./core";
import { deleteProof, deleteStagedProof, prepareProof, uploadedProofInput } from "./sales-log-files";

export type SalesActor = { id: string; name: string; email: string; isRoot: boolean };
export type SalesLog = typeof salesLogs.$inferSelect;
export const createSalesLogInput = z.object({
	requestKey: z.uuid(), buyerName: z.string().trim().min(1).max(120),
	buyerEmail: z.string().trim().toLowerCase().pipe(z.email().max(254)),
	buyerPhone: z.string().trim().min(1).max(40), category: z.enum(["normal", "vip"]),
	quantity: z.number().int().min(1).max(100), amountReceived: z.number().int().min(0).max(2_000_000_000),
	proof: uploadedProofInput.optional(),
});
export const salesLogPageInput = z.object({
	page: z.number().int().min(0).max(100000).default(0), pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]).default(25),
	search: z.string().trim().max(100).default(""), creator: z.string().trim().max(100).default(""),
	category: z.enum(["", "normal", "vip"]).default(""),
	from: z.union([z.iso.date(), z.literal("")]).default(""), to: z.union([z.iso.date(), z.literal("")]).default(""),
	minAmount: z.number().int().min(0).max(2_000_000_000).optional(), maxAmount: z.number().int().min(0).max(2_000_000_000).optional(),
	proof: z.enum(["", "yes", "no"]).default(""), emailStatus: z.enum(["", "pending", "sending", "sent", "failed"]).default(""),
	validity: z.enum(["", "valid", "revoked"]).default(""), checkIn: z.enum(["", "admitted", "unused"]).default(""),
	sort: z.enum(["createdAt", "buyer", "creator", "category", "quantity", "amountReceived", "emailStatus"]).default("createdAt"), direction: z.enum(["asc", "desc"]).default("desc"),
}).refine(input => !input.from || !input.to || input.from <= input.to, { message: "invalidDateRange" })
	.refine(input => input.minAmount === undefined || input.maxAmount === undefined || input.minAmount <= input.maxAmount, { message: "invalidAmountRange" });
const scope = (actor: SalesActor) => actor.isRoot ? undefined : eq(salesLogs.createdBy, actor.id);
const pattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const day = (date: string) => new Date(`${date}T00:00:00+07:00`);

export async function accessibleSalesLog(id: string, actor: SalesActor) {
	const [log] = await db.select().from(salesLogs).where(and(eq(salesLogs.id, id), scope(actor)));
	if (!log) ticketError("notFound", "NOT_FOUND");
	return log;
}
function assertSameSale(log: SalesLog, input: z.infer<typeof createSalesLogInput>) {
	if (log.buyerName !== input.buyerName || log.buyerEmail !== input.buyerEmail || log.buyerPhone !== input.buyerPhone || log.category !== input.category || log.quantity !== input.quantity || log.amountReceived !== input.amountReceived || log.proofUploadId !== (input.proof?.uploadId ?? null) || log.proofFilename !== (input.proof?.filename ?? null)) ticketError("requestChanged", "CONFLICT");
}
export async function createSalesLog(input: z.infer<typeof createSalesLogInput>, actor: SalesActor) {
	const [previous] = await db.select().from(salesLogs).where(and(eq(salesLogs.createdBy, actor.id), eq(salesLogs.requestKey, input.requestKey)));
	if (previous) { assertSameSale(previous, input); return previous; }
	let proof: Awaited<ReturnType<typeof prepareProof>> | undefined;
	try { proof = input.proof ? await prepareProof(actor.id, input.proof) : undefined; }
	catch (error) {
		// A concurrent identical submission may have committed and removed its staging upload.
		const [existing] = await db.select().from(salesLogs).where(and(eq(salesLogs.createdBy, actor.id), eq(salesLogs.requestKey, input.requestKey)));
		if (existing) { assertSameSale(existing, input); return existing; }
		throw error;
	}
	let retained = false;
	try {
		const log = await ticketTransaction(async tx => {
			const settings = await lockSales(tx);
			const [existing] = await tx.select().from(salesLogs).where(and(eq(salesLogs.createdBy, actor.id), eq(salesLogs.requestKey, input.requestKey)));
			if (existing) { assertSameSale(existing, input); return existing; }
			await releaseExpiredReservations(tx);
			if (input.category === "vip" && await vipUsage(tx) + input.quantity > settings.vipCapacity) ticketError("vipSoldOut", "CONFLICT");
			const [created] = await tx.insert(salesLogs).values({
				id: randomUUID(), requestKey: input.requestKey, buyerName: input.buyerName, buyerEmail: input.buyerEmail, buyerPhone: input.buyerPhone,
				category: input.category, quantity: input.quantity, amountReceived: input.amountReceived,
				proofUploadId: proof?.uploadId, proofObjectKey: proof?.objectKey, proofFilename: proof?.filename,
				createdBy: actor.id, creatorName: actor.name, creatorEmail: actor.email,
			}).returning();
			for (let ordinal = 1; ordinal <= input.quantity; ordinal++) await issueTicket(tx, {
				source: "sales-log", salesLogId: created!.id, category: input.category, ordinal,
				benefits: input.category === "vip" ? ["networkingLunch"] : [], recipientName: input.buyerName, recipientEmail: input.buyerEmail, recipientPhone: input.buyerPhone,
			});
			await audit(tx, actor.id, "salesLogCreated", created!.id);
			return created!;
		});
		retained = log.proofObjectKey === proof?.objectKey;
		if (input.proof) await deleteStagedProof(actor.id, input.proof.uploadId);
		return log;
	} finally { if (proof && !retained) await deleteProof(proof.objectKey); }
}

// Avoid returning private object keys or delivery coordination fields to clients.
export function publicSalesLog(log: SalesLog) {
	const { proofObjectKey, emailAttemptId: _attempt, emailLeaseUntil, requestKey: _request, proofUploadId: _upload, ...rest } = log;
	return { ...rest, hasProof: !!proofObjectKey, canRetryEmail: log.emailStatus === "pending" || log.emailStatus === "failed" || (log.emailStatus === "sending" && (!emailLeaseUntil || emailLeaseUntil.getTime() <= Date.now())) };
}
export async function salesLogDetail(id: string, actor: SalesActor) {
	const log = await accessibleSalesLog(id, actor);
	const [tickets, attempts, actions] = await Promise.all([
		db.select().from(admissionTickets).where(eq(admissionTickets.salesLogId, id)).orderBy(admissionTickets.ordinal),
		db.select().from(salesLogEmailAttempts).where(eq(salesLogEmailAttempts.salesLogId, id)).orderBy(desc(salesLogEmailAttempts.createdAt), salesLogEmailAttempts.id).limit(100),
		db.select().from(ticketAudit).where(eq(ticketAudit.entityId, id)).orderBy(desc(ticketAudit.createdAt), ticketAudit.id).limit(100),
	]);
	return { log: publicSalesLog(log), tickets, attempts, actions };
}
export async function listSalesLogs(input: z.infer<typeof salesLogPageInput>, actor: SalesActor) {
	const filter = and(scope(actor),
		input.search ? or(...[salesLogs.id, salesLogs.buyerName, salesLogs.buyerEmail, salesLogs.buyerPhone].map(column => ilike(column, pattern(input.search)))) : undefined,
		input.creator ? or(ilike(salesLogs.creatorName, pattern(input.creator)), ilike(salesLogs.creatorEmail, pattern(input.creator))) : undefined,
		input.category ? eq(salesLogs.category, input.category) : undefined,
		input.from ? gte(salesLogs.createdAt, day(input.from)) : undefined,
		input.to ? lt(salesLogs.createdAt, new Date(day(input.to).getTime() + 86400000)) : undefined,
		input.minAmount !== undefined ? gte(salesLogs.amountReceived, input.minAmount) : undefined,
		input.maxAmount !== undefined ? lte(salesLogs.amountReceived, input.maxAmount) : undefined,
		input.proof ? input.proof === "yes" ? isNotNull(salesLogs.proofObjectKey) : isNull(salesLogs.proofObjectKey) : undefined,
		input.emailStatus ? eq(salesLogs.emailStatus, input.emailStatus) : undefined,
		input.validity ? sql`exists (select 1 from admission_tickets t where t.sales_log_id = ${salesLogs.id} and t.validity = ${input.validity})` : undefined,
		input.checkIn ? sql`exists (select 1 from admission_tickets t where t.sales_log_id = ${salesLogs.id} and ${input.checkIn === "admitted" ? sql`t.accepted_count > 0` : sql`t.accepted_count = 0`})` : undefined,
	);
	const columns = { createdAt: salesLogs.createdAt, buyer: salesLogs.buyerName, creator: salesLogs.creatorName, category: salesLogs.category, quantity: salesLogs.quantity, amountReceived: salesLogs.amountReceived, emailStatus: salesLogs.emailStatus };
	const direction = input.direction === "asc" ? asc : desc;
	const [rows, totals] = await Promise.all([
		db.select().from(salesLogs).where(filter).orderBy(direction(columns[input.sort]), desc(salesLogs.createdAt), salesLogs.id).limit(input.pageSize).offset(input.page * input.pageSize),
		db.select({ total: sql<number>`count(*)::int` }).from(salesLogs).where(filter),
	]);
	return { items: rows.map(publicSalesLog), total: totals[0]?.total ?? 0, pageSize: input.pageSize };
}
