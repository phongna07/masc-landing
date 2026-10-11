import { randomUUID } from "node:crypto";
import { db } from "@masc-landing/db";
import { adminEmails } from "@masc-landing/db/schema/admin-emails";
import { ticketTransaction } from "@masc-landing/db/ticket-transaction";
import { admissionTickets, giftBatches, ticketAudit, ticketCheckIns, ticketEmailJobs, ticketOrders, ticketPackages, ticketPaymentEvents, ticketRefunds, ticketSettings } from "@masc-landing/db/schema/tickets";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, issueTicket, lockSales, reserveCode, releaseExpiredReservations, ticketError, vipUsage } from "./core";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
export const eventInput = z.object({ name: z.string().trim().min(1).max(120), date: z.iso.datetime({ offset: true }).nullable(), venue: z.string().trim().max(160).nullable(), timezone: z.string().refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }) });
export const settingsInput = z.object({ isSalesOpened: z.boolean(), vipCapacity: z.number().int().min(0).max(100000), event: eventInput, prices: z.object({ Silver: z.number().int().min(1000).max(1000000000), Golden: z.number().int().min(1000).max(1000000000), Platinum: z.number().int().min(1000).max(1000000000), VIP: z.number().int().min(1000).max(1000000000) }) });
export async function updateSettings(input: z.infer<typeof settingsInput>, actorId: string) {
	await ticketTransaction(async tx => {
		await lockSales(tx);
		await releaseExpiredReservations(tx);
		if (input.vipCapacity < await vipUsage(tx)) ticketError("capacityTooLow", "CONFLICT");
		await tx.update(ticketSettings).set({ isSalesOpened: input.isSalesOpened, vipCapacity: input.vipCapacity, event: input.event, updatedAt: sql`now()` }).where(eq(ticketSettings.id, 1));
		for (const name of ["Silver", "Golden", "Platinum", "VIP"] as const) await tx.update(ticketPackages).set({ price: input.prices[name] }).where(eq(ticketPackages.name, name));
		await audit(tx, actorId, "settingsUpdated", "1");
	});
}

export const batchInput = z.object({ requestKey: z.uuid(), quantity: z.number().int().min(1).max(100), category: z.enum(["normal", "vip"]), title: z.string().trim().min(1).max(120), note: optionalText(1000) });
export async function createGiftBatch(input: z.infer<typeof batchInput>, actorId: string) {
	return ticketTransaction(async tx => {
		const settings = await lockSales(tx);
		const [existing] = await tx.select().from(giftBatches).where(eq(giftBatches.requestKey, input.requestKey));
		if (existing) {
			if (existing.category !== input.category || existing.quantity !== input.quantity || existing.title !== input.title || existing.note !== (input.note || null)) ticketError("requestChanged", "CONFLICT");
			return existing;
		}
		const [batch] = await tx.insert(giftBatches).values({ id: randomUUID(), ...input, note: input.note || null, event: settings.event, createdBy: actorId }).returning();
		for (let ordinal = 1; ordinal <= input.quantity; ordinal++) await issueTicket(tx, { source: "gifted", category: input.category, batchId: batch!.id, ordinal, event: settings.event, benefits: input.category === "vip" ? ["networkingLunch"] : [] });
		await audit(tx, actorId, "giftBatchCreated", batch!.id);
		return batch!;
	});
}

export const recipientInput = z.object({ ticketId: z.uuid(), recipientName: optionalText(120), recipientPhone: optionalText(40), recipientEmail: z.union([z.email(), z.literal("")]).nullable().optional() });
export async function updateRecipient(input: z.infer<typeof recipientInput>, actorId: string) {
	await ticketTransaction(async tx => {
		const [ticket] = await tx.select().from(admissionTickets).where(eq(admissionTickets.id, input.ticketId)).for("update");
		if (!ticket || ticket.source !== "gifted") ticketError("notFound", "NOT_FOUND");
		await tx.update(admissionTickets).set({ recipientName: input.recipientName || null, recipientPhone: input.recipientPhone || null, recipientEmail: input.recipientEmail || null }).where(eq(admissionTickets.id, ticket.id));
		await audit(tx, actorId, "giftRecipientUpdated", ticket.id);
	});
}

export async function changeTicket(ticketId: string, action: "revoke" | "replace", reason: string, actorId: string) {
	return ticketTransaction(async tx => {
		const [ticket] = await tx.select().from(admissionTickets).where(eq(admissionTickets.id, ticketId)).for("update");
		if (!ticket) ticketError("notFound", "NOT_FOUND");
		if (action === "replace" && ticket.validity !== "valid") ticketError("revoked", "CONFLICT");
		// Replacement rotates the same admission; it never resets the admission count.
		const update = action === "revoke" ? { validity: "revoked" as const } : { code: await reserveCode(tx, ticket.id), credentialVersion: ticket.credentialVersion + 1 };
		await tx.update(admissionTickets).set(update).where(eq(admissionTickets.id, ticket.id));
		await audit(tx, actorId, action, ticket.id, reason);
	});
}

export const refundInput = z.object({ orderId: z.uuid(), requestKey: z.uuid(), status: z.enum(["pending", "completed", "failed"]), amount: z.number().int().positive().max(2_000_000_000), reason: z.string().trim().min(1).max(1000), reference: optionalText(200) });
export async function recordRefund(input: z.infer<typeof refundInput>, actorId: string) {
	await ticketTransaction(async tx => {
		const [order] = await tx.select().from(ticketOrders).where(eq(ticketOrders.id, input.orderId)).for("update");
		if (!order) ticketError("notFound", "NOT_FOUND");
		const [existing] = await tx.select().from(ticketRefunds).where(eq(ticketRefunds.requestKey, input.requestKey));
		if (existing) return;
		const [totals] = await tx.select({ completed: sql<number>`coalesce(sum(${ticketRefunds.amount}) filter (where ${ticketRefunds.status} = 'completed'), 0)::int` }).from(ticketRefunds).where(eq(ticketRefunds.orderId, order.id));
		if (input.amount > order.settledAmount || (input.status === "completed" && input.amount + (totals?.completed ?? 0) > order.settledAmount)) ticketError("refundTooHigh", "CONFLICT");
		await tx.insert(ticketRefunds).values({ id: randomUUID(), ...input, reference: input.reference || null, actorId });
		await audit(tx, actorId, "refundRecorded", order.id, input.reason);
		// No repayment, ticket revocation, or VIP-capacity release is implied.
	});
}

export async function enqueueDelivery(input: { orderId?: string; ticketId?: string; requestKey: string; locale?: "en" | "vi" }, actorId: string) {
	return ticketTransaction(async tx => {
		let toAddress: string;
		let locale: "en" | "vi";
		if (input.orderId) {
			const [order] = await tx.select().from(ticketOrders).where(eq(ticketOrders.id, input.orderId));
			if (!order || order.fulfillmentStatus !== "issued") ticketError("notIssued", "CONFLICT");
			toAddress = order.buyerEmail; locale = order.locale;
		} else {
			const [ticket] = await tx.select().from(admissionTickets).where(eq(admissionTickets.id, input.ticketId!));
			if (!ticket || ticket.source !== "gifted" || !ticket.recipientEmail) ticketError("recipientEmailRequired");
			toAddress = ticket.recipientEmail; locale = input.locale ?? "vi";
		}
		const [job] = await tx.insert(ticketEmailJobs).values({ id: randomUUID(), dedupeKey: `resend:${input.requestKey}`, orderId: input.orderId, ticketId: input.ticketId, toAddress, locale }).onConflictDoNothing().returning();
		if (job) await audit(tx, actorId, "emailQueued", input.orderId ?? input.ticketId!, null);
	});
}

export const pageInput = z.object({ page: z.number().int().min(0).max(100000).default(0), search: z.string().trim().max(100).default(""), status: z.string().max(40).default(""), category: z.enum(["", "normal", "vip"]).default(""), validity: z.enum(["", "valid", "revoked"]).default(""), fulfillment: z.enum(["", "pending", "issued", "review"]).default(""), emailStatus: z.enum(["", "pending", "sending", "sent", "failed"]).default("") });
const pageSize = 20;
export async function listOrders(input: z.infer<typeof pageInput>, buyerId?: string) {
	const filter = and(buyerId ? eq(ticketOrders.buyerId, buyerId) : undefined,
		input.search ? or(ilike(ticketOrders.id, `%${input.search}%`), ilike(ticketOrders.buyerEmail, `%${input.search}%`), ilike(ticketOrders.buyerName, `%${input.search}%`)) : undefined,
		input.status ? sql`${ticketOrders.paymentStatus} = ${input.status}` : undefined,
		input.category ? sql`${ticketOrders.snapshot}->>'category' = ${input.category}` : undefined,
		input.fulfillment ? eq(ticketOrders.fulfillmentStatus, input.fulfillment) : undefined,
		input.validity ? sql`exists (select 1 from admission_tickets t where t.order_id = ${ticketOrders.id} and t.validity = ${input.validity})` : undefined,
		input.emailStatus ? sql`exists (select 1 from ticket_email_jobs j where j.order_id = ${ticketOrders.id} and j.status = ${input.emailStatus})` : undefined);
	const [rows, totals] = await Promise.all([
		db.select().from(ticketOrders).where(filter).orderBy(desc(ticketOrders.createdAt), ticketOrders.id).limit(pageSize).offset(input.page * pageSize),
		db.select({ total: sql<number>`count(*)::int` }).from(ticketOrders).where(filter),
	]);
	const orderIds = rows.map(o => o.id);
	const [tickets, jobs] = orderIds.length ? await Promise.all([
		db.select().from(admissionTickets).where(inArray(admissionTickets.orderId, orderIds)).orderBy(admissionTickets.ordinal),
		db.select({ id: ticketEmailJobs.id, orderId: ticketEmailJobs.orderId, status: ticketEmailJobs.status, attempts: ticketEmailJobs.attempts, sentAt: ticketEmailJobs.sentAt }).from(ticketEmailJobs).where(inArray(ticketEmailJobs.orderId, orderIds)).orderBy(desc(ticketEmailJobs.createdAt)),
	]) : [[], []];
	return { items: rows.map(order => ({ ...order, tickets: tickets.filter(t => t.orderId === order.id), emailJobs: jobs.filter(j => j.orderId === order.id) })), total: totals[0]?.total ?? 0, pageSize };
}

export async function listBatches(input: z.infer<typeof pageInput>) {
	const filter = and(input.search ? or(ilike(giftBatches.title, `%${input.search}%`), ilike(giftBatches.id, `%${input.search}%`)) : undefined, input.category ? eq(giftBatches.category, input.category) : undefined);
	const [items, totals] = await Promise.all([db.select().from(giftBatches).where(filter).orderBy(desc(giftBatches.createdAt)).limit(pageSize).offset(input.page * pageSize), db.select({ total: sql<number>`count(*)::int` }).from(giftBatches).where(filter)]);
	return { items, total: totals[0]?.total ?? 0, pageSize };
}

export async function orderDetail(orderId: string) {
	const [order] = await db.select().from(ticketOrders).where(eq(ticketOrders.id, orderId));
	if (!order) ticketError("notFound", "NOT_FOUND");
	const [tickets, events, jobs, refunds, actions] = await Promise.all([
		db.select().from(admissionTickets).where(eq(admissionTickets.orderId, order.id)).orderBy(admissionTickets.ordinal),
		db.select().from(ticketPaymentEvents).where(eq(ticketPaymentEvents.orderId, order.id)).orderBy(desc(ticketPaymentEvents.createdAt)).limit(100),
		db.select().from(ticketEmailJobs).where(eq(ticketEmailJobs.orderId, order.id)).orderBy(desc(ticketEmailJobs.createdAt)).limit(100),
		db.select().from(ticketRefunds).where(eq(ticketRefunds.orderId, order.id)).orderBy(desc(ticketRefunds.createdAt)),
		db.select().from(ticketAudit).where(eq(ticketAudit.entityId, order.id)).orderBy(desc(ticketAudit.createdAt)).limit(100),
	]);
	return { order, tickets, events, jobs, refunds, actions };
}

export async function batchDetail(batchId: string) {
	const [batch] = await db.select().from(giftBatches).where(eq(giftBatches.id, batchId));
	if (!batch) ticketError("notFound", "NOT_FOUND");
	const tickets = await db.select().from(admissionTickets).where(eq(admissionTickets.batchId, batchId)).orderBy(admissionTickets.ordinal);
	const jobs = await db.select().from(ticketEmailJobs).where(inArray(ticketEmailJobs.ticketId, tickets.map(t => t.id))).orderBy(desc(ticketEmailJobs.createdAt));
	return { batch, tickets, jobs };
}

export async function ticketHistory(ticketId: string, page = 0) {
	const historyPageSize = 50;
	const [checkIns, actions, checkInTotals, actionTotals] = await Promise.all([
		db.select().from(ticketCheckIns).where(eq(ticketCheckIns.ticketId, ticketId)).orderBy(desc(ticketCheckIns.createdAt), ticketCheckIns.id).limit(historyPageSize).offset(page * historyPageSize),
		db.select().from(ticketAudit).where(eq(ticketAudit.entityId, ticketId)).orderBy(desc(ticketAudit.createdAt), ticketAudit.id).limit(historyPageSize).offset(page * historyPageSize),
		db.select({ total: sql<number>`count(*)::int` }).from(ticketCheckIns).where(eq(ticketCheckIns.ticketId, ticketId)),
		db.select({ total: sql<number>`count(*)::int` }).from(ticketAudit).where(eq(ticketAudit.entityId, ticketId)),
	]);
	return { checkIns, actions, checkInTotal: checkInTotals[0]?.total ?? 0, actionTotal: actionTotals[0]?.total ?? 0, pageSize: historyPageSize };
}

export async function recordResolution(orderId: string, reason: string, actorId: string) {
	await ticketTransaction(async tx => {
		const [order] = await tx.select().from(ticketOrders).where(eq(ticketOrders.id, orderId)).for("update");
		if (!order || !order.issue) ticketError("resolutionNotAllowed", "CONFLICT");
		await tx.update(ticketOrders).set({ resolutionNote: reason.replace(/[A-HJ-NP-Z2-9]{20}/gi, "[REDACTED]"), resolvedBy: actorId, resolvedAt: sql`now()` }).where(eq(ticketOrders.id, order.id));
		await audit(tx, actorId, "paymentResolutionRecorded", order.id, reason);
	});
}

export async function setEntranceStaff(email: string, enabled: boolean, actorId: string) {
	await ticketTransaction(async tx => {
		const normalized = email.trim().toLowerCase();
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${normalized}, 0))`);
		const [admin] = await tx.select().from(adminEmails).where(eq(adminEmails.email, normalized)).for("update");
		if (admin && admin.role !== "entrance-staff") ticketError("existingAdminRole", "CONFLICT");
		if (enabled) await tx.insert(adminEmails).values({ email: normalized, role: "entrance-staff" }).onConflictDoNothing();
		else if (admin) await tx.delete(adminEmails).where(eq(adminEmails.email, normalized));
		await audit(tx, actorId, enabled ? "entranceStaffGranted" : "entranceStaffRemoved", normalized);
	});
}
