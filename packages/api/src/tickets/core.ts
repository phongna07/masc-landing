import { createHash, randomInt, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { db } from "@masc-landing/db";
import { ticketTransaction, type TicketTransaction } from "@masc-landing/db/ticket-transaction";
import { admissionTickets, ticketAudit, ticketCredentials, ticketOrders, ticketPackages, ticketRateLimits, ticketSettings, salesLogs } from "@masc-landing/db/schema/tickets";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";

export const checkoutMinutes = 15;
export const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const codeLength = 20; // 32 symbols × 20 characters = 100 bits of entropy.
export const codePattern = /^[A-HJ-NP-Z2-9]{20}$/;
export const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");
export type Ticket = typeof admissionTickets.$inferSelect;
export type Order = typeof ticketOrders.$inferSelect;

export function buyerOrder(order: Order) {
	return { id: order.id, snapshot: order.snapshot, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, issue: order.issue, expiresAt: order.expiresAt, createdAt: order.createdAt, checkoutUrl: order.checkoutUrl, checkoutClosedAt: order.checkoutClosedAt, paidAt: order.paidAt };
}

export function ticketError(message: string, code: "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" | "FORBIDDEN" | "PRECONDITION_FAILED" = "BAD_REQUEST"): never {
	throw new TRPCError({ code, message });
}

export async function initializeTickets(tx: TicketTransaction) {
	await tx.insert(ticketSettings).values({ id: 1 }).onConflictDoNothing();
	await tx.insert(ticketPackages).values([
		{ name: "Silver", category: "normal", quantity: 1, price: 129000, benefits: [] },
		{ name: "Golden", category: "normal", quantity: 2, price: 249000, benefits: [] },
		{ name: "Platinum", category: "normal", quantity: 3, price: 349000, benefits: [] },
		{ name: "VIP", category: "vip", quantity: 1, price: 199000, benefits: ["networkingLunch"] },
	]).onConflictDoNothing();
}

// Always lock settings BEFORE orders when capacity is involved. This serializes
// checkout, expiry, fulfillment and capacity edits, including across instances.
export async function lockSales(tx: TicketTransaction) {
	await initializeTickets(tx);
	const [settings] = await tx.select().from(ticketSettings).where(eq(ticketSettings.id, 1)).for("update");
	return settings!;
}

export async function releaseExpiredReservations(tx: TicketTransaction) {
	await tx.update(ticketOrders).set({ promoReservation: "released", updatedAt: sql`now()` })
		.where(and(eq(ticketOrders.promoReservation, "held"), lte(ticketOrders.expiresAt, sql`now()`)));
	await tx.update(ticketOrders).set({ reservation: "released", updatedAt: sql`now()` })
		.where(and(eq(ticketOrders.reservation, "held"), lte(ticketOrders.expiresAt, sql`now()`)));
	await tx.update(ticketOrders).set({ paymentStatus: "expired", updatedAt: sql`now()` })
		.where(and(inArray(ticketOrders.paymentStatus, ["creating", "pending", "processing"]), eq(ticketOrders.fulfillmentStatus, "pending"), lte(ticketOrders.expiresAt, sql`now()`)));
	await tx.update(ticketOrders).set({ checkoutClosedAt: sql`coalesce(${ticketOrders.checkoutClosedAt}, now())` })
		.where(and(sql`${ticketOrders.fulfillmentStatus} <> 'issued'`, lte(ticketOrders.expiresAt, sql`now()`)));
}

export async function vipUsage(tx: TicketTransaction) {
	const [result] = await tx.select({ count: sql<number>`coalesce(sum((${ticketOrders.snapshot}->>'quantity')::int), 0)::int` }).from(ticketOrders)
		.where(inArray(ticketOrders.reservation, ["held", "consumed"]));
	const [offline] = await tx.select({ count: sql<number>`coalesce(sum(${salesLogs.quantity}), 0)::int` }).from(salesLogs).where(eq(salesLogs.category, "vip"));
	return (result?.count ?? 0) + (offline?.count ?? 0);
}

export async function getTicketConfig() {
	return ticketTransaction(async tx => {
		const settings = await lockSales(tx);
		await releaseExpiredReservations(tx);
		const used = await vipUsage(tx);
		return { ...settings, vipUsed: used, vipAvailable: Math.max(0, settings.vipCapacity - used), packages: await tx.select().from(ticketPackages) };
	});
}

export async function rateLimit(actorId: string, scope: string, limit: number) {
	const key = `${scope}:${actorId}`;
	const [row] = await db.insert(ticketRateLimits).values({ key }).onConflictDoUpdate({
		target: ticketRateLimits.key,
		set: {
			count: sql`case when ${ticketRateLimits.windowStart} < now() - interval '1 minute' then 1 else ${ticketRateLimits.count} + 1 end`,
			windowStart: sql`case when ${ticketRateLimits.windowStart} < now() - interval '1 minute' then now() else ${ticketRateLimits.windowStart} end`,
		},
	}).returning({ count: ticketRateLimits.count });
	if (row!.count > limit) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "rateLimited" });
}

export async function audit(tx: TicketTransaction, actorId: string, action: string, entityId: string | null, reason: string | null = null, outcome = "success", metadata: typeof ticketAudit.$inferInsert.metadata = null) {
	// Reasons are free text: strip any admission-shaped credential before storage.
	const safeReason = reason?.replace(/[A-HJ-NP-Z2-9]{20}/gi, "[REDACTED]") ?? null;
	await tx.insert(ticketAudit).values({ id: randomUUID(), actorId, action, entityId, reason: safeReason, outcome, metadata });
}

export async function reserveCode(tx: TicketTransaction, ticketId: string) {
	for (let attempt = 0; attempt < 8; attempt++) {
		const code = Array.from({ length: codeLength }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join("");
		const [row] = await tx.insert(ticketCredentials).values({ codeHash: hashCode(code), ticketId }).onConflictDoNothing().returning();
		if (row) return code;
	}
	throw new Error("Ticket credential generation failed");
}

export async function issueTicket(tx: TicketTransaction, values: Omit<typeof admissionTickets.$inferInsert, "id" | "code">) {
	const id = randomUUID();
	const code = await reserveCode(tx, id);
	const [ticket] = await tx.insert(admissionTickets).values({ ...values, id, code }).returning();
	return ticket!;
}

export async function ownedOrder(orderId: string, buyerId: string) {
	const [order] = await db.select().from(ticketOrders).where(and(eq(ticketOrders.id, orderId), eq(ticketOrders.buyerId, buyerId)));
	if (!order) ticketError("notFound", "NOT_FOUND");
	return order;
}

export async function accessibleTicket(ticketId: string, userId: string, isRoot: boolean, canViewOwnSales = false) {
	const ownSales = canViewOwnSales ? sql`(${admissionTickets.source} = 'sales-log' and exists (select 1 from ticket_sales_logs s where s.id = ${admissionTickets.salesLogId} and s.created_by = ${userId}))` : undefined;
	const [ticket] = await db.select().from(admissionTickets).where(and(eq(admissionTickets.id, ticketId), isRoot ? undefined : or(and(eq(admissionTickets.ownerId, userId), eq(admissionTickets.source, "purchased")), ownSales)));
	if (!ticket) ticketError("notFound", "NOT_FOUND");
	return ticket;
}
