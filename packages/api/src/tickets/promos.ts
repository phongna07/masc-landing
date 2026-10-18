import { randomUUID } from "node:crypto";
import { ticketTransaction, type TicketTransaction } from "@masc-landing/db/ticket-transaction";
import { ticketOrders, ticketPromos } from "@masc-landing/db/schema/tickets";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, lockSales, rateLimit, releaseExpiredReservations, ticketError } from "./core";

export const promoCodeInput = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,64}$/, "promoCodeFormat");
const price = z.number().int().max(1_000_000_000).refine(value => value === 0 || value >= 1000, "promoPriceInvalid");
const limit = z.number().int().positive().max(2_147_483_647).nullable();
export const promoInput = z.object({
	code: promoCodeInput, enabled: z.boolean().default(true),
	prices: z.object({ Silver: price, Golden: price, Platinum: price, VIP: price }),
	totalLimit: limit.default(null), perBuyerLimit: limit.default(null),
});
export const updatePromoInput = promoInput.extend({ id: z.uuid(), revision: z.uuid() });
export const checkPromoInput = z.object({ code: promoCodeInput });
export const checkedPromoInput = checkPromoInput.extend({ revision: z.uuid() });
type Promo = typeof ticketPromos.$inferSelect;

export async function promoUsage(tx: TicketTransaction, promoId: string, buyerId?: string) {
	const [usage] = await tx.select({
		held: sql<number>`count(*) filter (where ${ticketOrders.promoReservation} = 'held')::int`,
		consumed: sql<number>`count(*) filter (where ${ticketOrders.promoReservation} = 'consumed')::int`,
	}).from(ticketOrders).where(and(eq(ticketOrders.promoId, promoId), buyerId ? eq(ticketOrders.buyerId, buyerId) : undefined));
	return usage!;
}

// Caller holds the sales lock. Eligibility can change between checking and checkout.
export async function assertPromoCapacity(tx: TicketTransaction, promo: Promo, buyerId: string) {
	const total = await promoUsage(tx, promo.id);
	if (promo.totalLimit !== null && total.held + total.consumed >= promo.totalLimit) ticketError("promoLimitReached", "CONFLICT");
	const buyer = await promoUsage(tx, promo.id, buyerId);
	if (promo.perBuyerLimit !== null && buyer.held + buyer.consumed >= promo.perBuyerLimit) ticketError("promoBuyerLimitReached", "CONFLICT");
}

export async function eligiblePromo(tx: TicketTransaction, code: string, buyerId: string, revision?: string) {
	const [promo] = await tx.select().from(ticketPromos).where(eq(ticketPromos.code, code));
	if (!promo || !promo.enabled) ticketError("promoUnavailable", "PRECONDITION_FAILED");
	if (revision && promo.revision !== revision) ticketError("promoChanged", "CONFLICT");
	await assertPromoCapacity(tx, promo, buyerId);
	return promo;
}

export async function checkPromo(code: string, buyerId: string) {
	code = promoCodeInput.parse(code);
	await rateLimit(buyerId, "promo-check", 20);
	return ticketTransaction(async tx => {
		await lockSales(tx);
		await releaseExpiredReservations(tx);
		const promo = await eligiblePromo(tx, code, buyerId);
		return { code: promo.code, revision: promo.revision, prices: promo.prices };
	});
}

export async function listPromos() {
	return ticketTransaction(async tx => {
		await lockSales(tx);
		await releaseExpiredReservations(tx);
		const promos = await tx.select().from(ticketPromos).orderBy(desc(ticketPromos.createdAt), ticketPromos.id);
		return Promise.all(promos.map(async promo => ({ ...promo, ...await promoUsage(tx, promo.id) })));
	});
}

export async function savePromo(raw: z.input<typeof promoInput> | z.input<typeof updatePromoInput>, actorId: string, update = false) {
	const input = promoInput.parse(raw);
	const updating = update ? updatePromoInput.parse(raw) : null;
	return ticketTransaction(async tx => {
		await lockSales(tx);
		await releaseExpiredReservations(tx);
		const id = updating?.id ?? randomUUID();
		if (updating) {
			const [existing] = await tx.select().from(ticketPromos).where(eq(ticketPromos.id, id));
			if (!existing) ticketError("notFound", "NOT_FOUND");
			if (existing.revision !== updating.revision) ticketError("promoChanged", "CONFLICT");
		}
		const [duplicate] = await tx.select({ id: ticketPromos.id }).from(ticketPromos).where(and(eq(ticketPromos.code, input.code), ne(ticketPromos.id, id)));
		if (duplicate) ticketError("promoDuplicate", "CONFLICT");
		const usage = await promoUsage(tx, id);
		if (input.totalLimit !== null && input.totalLimit < usage.held + usage.consumed) ticketError("promoLimitTooLow", "CONFLICT");
		if (input.perBuyerLimit !== null) {
			const [maximum] = await tx.select({ buyerId: ticketOrders.buyerId }).from(ticketOrders)
				.where(and(eq(ticketOrders.promoId, id), inArray(ticketOrders.promoReservation, ["held", "consumed"])))
				.groupBy(ticketOrders.buyerId).having(sql`count(*) > ${input.perBuyerLimit}`).limit(1);
			if (maximum) ticketError("promoLimitTooLow", "CONFLICT");
		}
		const values = { code: input.code, enabled: input.enabled, prices: input.prices, totalLimit: input.totalLimit, perBuyerLimit: input.perBuyerLimit, revision: randomUUID(), updatedAt: sql`now()` };
		const [saved] = updating
			? await tx.update(ticketPromos).set(values).where(eq(ticketPromos.id, id)).returning()
			: await tx.insert(ticketPromos).values({ id, ...values }).returning();
		await audit(tx, actorId, update ? "promoUpdated" : "promoCreated", id, null, "success", { promoCode: saved!.code, revision: saved!.revision, prices: saved!.prices, totalLimit: saved!.totalLimit, perBuyerLimit: saved!.perBuyerLimit, enabled: saved!.enabled });
		return saved!;
	});
}

// Existing orders keep their code and prices. Only released uses need capacity again.
export async function reacquirePromo(tx: TicketTransaction, order: typeof ticketOrders.$inferSelect) {
	if (!order.promoId || order.promoReservation === "held" || order.promoReservation === "consumed") return;
	const [promo] = await tx.select().from(ticketPromos).where(eq(ticketPromos.id, order.promoId));
	if (!promo) ticketError("promoUnavailable", "CONFLICT");
	await assertPromoCapacity(tx, promo, order.buyerId);
}
