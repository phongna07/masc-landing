import { createHash, randomInt, randomUUID } from "node:crypto";
import { APIError, InvalidSignatureError, WebhookError } from "@payos/node";
import { db } from "@masc-landing/db";
import { ticketTransaction, type TicketTransaction } from "@masc-landing/db/ticket-transaction";
import { ticketEmailJobs, ticketOrders, ticketPackages, ticketPaymentEvents } from "@masc-landing/db/schema/tickets";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, issueTicket, lockSales, ownedOrder, rateLimit, releaseExpiredReservations, ticketError, vipUsage, type Order } from "./core";
import { checkoutUrl, orderReturnUrl, payos, validCheckoutUrl } from "./payos";
import { reconciliationClaim, reconciliationCompletion, reconciliationDue, reconciliationOwner, reconciliationRequest } from "./reconciliation";
import { checkedPromoInput, eligiblePromo, reacquirePromo } from "./promos";

export const checkoutInput = z.object({
	requestKey: z.uuid(), packageName: z.enum(["Silver", "Golden", "Platinum", "VIP"]),
	promo: checkedPromoInput.optional(),
	buyerName: z.string().trim().min(1).max(120), buyerPhone: z.string().trim().min(1).max(40),
});
type Buyer = { id: string; email: string };

export async function startCheckout(buyer: Buyer, input: z.infer<typeof checkoutInput>) {
	input = checkoutInput.parse(input);
	await rateLimit(buyer.id, "checkout", 10);
	const order = await ticketTransaction(async tx => {
		const settings = await lockSales(tx);
		await releaseExpiredReservations(tx);
		const [existing] = await tx.select().from(ticketOrders).where(and(eq(ticketOrders.buyerId, buyer.id), eq(ticketOrders.requestKey, input.requestKey)));
		if (existing) {
			if (existing.snapshot.packageName !== input.packageName || (existing.snapshot.promo?.code ?? null) !== (input.promo?.code ?? null)) ticketError("requestChanged", "CONFLICT");
			return existing;
		}
		if (!settings.isSalesOpened) ticketError("salesClosed", "PRECONDITION_FAILED");
		const [pack] = await tx.select().from(ticketPackages).where(eq(ticketPackages.name, input.packageName));
		if (!pack) ticketError("notFound", "NOT_FOUND");
		const promo = input.promo ? await eligiblePromo(tx, input.promo.code, buyer.id, input.promo.revision) : null;
		const totalPrice = promo ? promo.prices[pack.name] : pack.price;
		if (totalPrice > 0) payos(); // Validate configuration before committing any paid order or reservation.
		if (pack.category === "vip") {
			// lockSales serializes this check with reservation creation across instances.
			// Count uncertain/review orders too while they still hold a place.
			const [held] = await tx.select({ id: ticketOrders.id }).from(ticketOrders)
				.where(and(eq(ticketOrders.buyerId, buyer.id), eq(ticketOrders.reservation, "held"))).limit(1);
			if (held) {
				await audit(tx, buyer.id, "vipReservationBlocked", held.id, null, "rejected");
				return null;
			}
			if (await vipUsage(tx) >= settings.vipCapacity) ticketError("vipSoldOut", "CONFLICT");
		}
		for (let attempt = 0; attempt < 8; attempt++) {
			const [created] = await tx.insert(ticketOrders).values({
				id: randomUUID(), buyerId: buyer.id, requestKey: input.requestKey, providerOrderCode: randomInt(1_000_000_000_000, 10_000_000_000_000),
				buyerEmail: buyer.email, buyerName: input.buyerName, buyerPhone: input.buyerPhone, locale: "vi",
				snapshot: { packageName: pack.name, category: pack.category, quantity: pack.quantity, benefits: pack.benefits, currency: "VND", totalPrice, ...(promo ? { promo: { code: promo.code, revision: promo.revision, originalPrice: pack.price } } : {}) },
				promoId: promo?.id, promoReservation: promo ? "held" : "none",
				reservation: pack.category === "vip" ? "held" : "none",
				expiresAt: sql`date_trunc('second', now()) + interval '15 minutes'`, nextReconcileAt: sql`now() + interval '30 seconds'`,
			}).onConflictDoNothing().returning();
			if (created) {
				if (promo) await audit(tx, buyer.id, "promoApplied", created.id, null, "success", { promoCode: promo.code, revision: promo.revision });
				if (totalPrice === 0) {
					await fulfill(tx, created);
					await audit(tx, buyer.id, "freeOrderCompleted", created.id, null, "success", { promoCode: promo!.code, revision: promo!.revision });
				}
				return created;
			}
		}
		throw new Error("Unable to allocate provider order identifier");
	});
	// Reject after committing so the audit entry survives the failed checkout.
	if (!order) ticketError("vipReservationExists", "CONFLICT");
	if (order.snapshot.totalPrice > 0) await createPaymentLink(order.id);
	return ownedOrder(order.id, buyer.id);
}

async function createPaymentLink(orderId: string) {
	// CAS persists that a create request MAY have left the process. A crash or
	// timeout is recovered by GET of the SAME orderCode, never a blind second POST.
	const [order] = await db.update(ticketOrders).set({ createAttemptedAt: sql`now()`, updatedAt: sql`now()` })
		.where(and(eq(ticketOrders.id, orderId), isNull(ticketOrders.createAttemptedAt), eq(ticketOrders.paymentStatus, "creating"), sql`(${ticketOrders.snapshot}->>'totalPrice')::integer > 0`, sql`${ticketOrders.expiresAt} > now()`)).returning();
	if (!order) return;
	try {
		const result = await payos().paymentRequests.create({
			orderCode: order.providerOrderCode, amount: order.snapshot.totalPrice, description: "MASC" + String(order.providerOrderCode).slice(-5),
			returnUrl: orderReturnUrl(order.id), cancelUrl: orderReturnUrl(order.id), expiredAt: Math.floor(order.expiresAt.getTime() / 1000),
			buyerEmail: order.buyerEmail, buyerName: order.buyerName, buyerPhone: order.buyerPhone,
			items: [{ name: order.snapshot.packageName, quantity: 1, price: order.snapshot.totalPrice }],
		});
		await ticketTransaction(async tx => {
			await lockSales(tx);
			const [current] = await tx.select().from(ticketOrders).where(eq(ticketOrders.id, order.id)).for("update");
			const matches = result.orderCode === order.providerOrderCode && result.amount === order.snapshot.totalPrice && result.currency === order.snapshot.currency && (!current!.paymentLinkId || current!.paymentLinkId === result.paymentLinkId) && validCheckoutUrl(result.checkoutUrl);
			await tx.update(ticketOrders).set(matches ? {
				paymentLinkId: result.paymentLinkId, checkoutUrl: result.checkoutUrl,
				paymentStatus: current!.paymentStatus === "creating" ? "pending" : current!.paymentStatus, issue: current!.paymentStatus === "creating" ? null : current!.issue, updatedAt: sql`now()`,
			} : { paymentStatus: "review", fulfillmentStatus: current!.fulfillmentStatus === "issued" ? "issued" : "review", issue: "providerMismatch", updatedAt: sql`now()` }).where(eq(ticketOrders.id, order.id));
		});
	} catch (error) {
		// Only an explicit authentication/validation HTTP rejection is definitive.
		// Business errors, conflicts, 429, network errors and 5xx remain ambiguous.
		const rejected = error instanceof APIError && [400, 401, 403, 422].includes(error.status ?? 0);
		await ticketTransaction(async tx => {
			await lockSales(tx);
			const [current] = await tx.select().from(ticketOrders).where(eq(ticketOrders.id, order.id)).for("update");
			if (current?.paymentStatus !== "creating") return;
			await tx.update(ticketOrders).set({
				paymentStatus: rejected ? "failed" : "creating", issue: rejected ? "creationFailed" : "creationUnknown",
				reservation: rejected && current.reservation === "held" ? "released" : current.reservation,
				promoReservation: rejected && current.promoReservation === "held" ? "released" : current.promoReservation,
				nextReconcileAt: sql`case when ${ticketOrders.reconcileRequestId} is not null then ${ticketOrders.nextReconcileAt} else now() + interval '30 seconds' end`, updatedAt: sql`now()`,
			}).where(eq(ticketOrders.id, order.id));
		});
	}
}

const providerStatus = z.object({
	id: z.string().min(1), orderCode: z.number().int().safe().positive(), amount: z.number().int().nonnegative().max(2_000_000_000),
	amountPaid: z.number().int().nonnegative().max(2_000_000_000), amountRemaining: z.number().int(),
	status: z.enum(["PENDING", "PROCESSING", "UNDERPAID", "PAID", "CANCELLED", "EXPIRED", "FAILED"]),
	// The signed domestic payment-request API defines these amounts in VND.
	currency: z.string().optional(),
	transactions: z.array(z.object({ reference: z.string().min(1), amount: z.number().int().nonnegative().max(2_000_000_000), currency: z.string().optional() })),
});

async function fulfill(tx: TicketTransaction, order: Order) {
	if (order.fulfillmentStatus === "issued") return;
	for (let ordinal = 1; ordinal <= order.snapshot.quantity; ordinal++) {
		await issueTicket(tx, { source: "purchased", category: order.snapshot.category, ownerId: order.buyerId, orderId: order.id, ordinal, benefits: order.snapshot.benefits });
	}
	await tx.insert(ticketEmailJobs).values({ id: randomUUID(), dedupeKey: `initial:${order.id}`, orderId: order.id, toAddress: order.buyerEmail, locale: "vi" }).onConflictDoNothing();
	await tx.update(ticketOrders).set({ paymentStatus: "paid", fulfillmentStatus: "issued", paidAt: sql`coalesce(${ticketOrders.paidAt}, now())`, reservation: order.snapshot.category === "vip" ? "consumed" : "none", promoReservation: order.promoId ? "consumed" : "none", issue: null, updatedAt: sql`now()` }).where(eq(ticketOrders.id, order.id));
}

export async function applyProviderStatus(orderId: string, rawStatus: unknown, leaseId?: string) {
	const result = providerStatus.safeParse(rawStatus);
	return ticketTransaction(async tx => {
		await lockSales(tx);
		await releaseExpiredReservations(tx);
		const [order] = await tx.select().from(ticketOrders).where(eq(ticketOrders.id, orderId)).for("update");
		if (!order) ticketError("notFound", "NOT_FOUND");
		if (order.snapshot.totalPrice === 0) return;
		if (leaseId && order.reconcileLeaseId !== leaseId) return;
		let issue: string | null = null;
		if (!result.success) issue = "providerMismatch";
		const status = result.success ? result.data : null;
		if (status && (status.orderCode !== order.providerOrderCode || (order.paymentLinkId && order.paymentLinkId !== status.id) || status.amount !== order.snapshot.totalPrice || (status.currency && status.currency !== order.snapshot.currency))) issue = "providerMismatch";
		const events = await tx.select().from(ticketPaymentEvents).where(eq(ticketPaymentEvents.orderId, order.id));
		if (events.some(e => e.kind === "webhook" && (e.currency !== order.snapshot.currency || e.paymentLinkId !== status?.id || e.outcome === "mismatch"))) issue = "providerMismatch";
		if (status) {
			const references = status.transactions.map(t => t.reference);
			if (new Set(references).size !== references.length || status.transactions.some(t => t.currency && t.currency !== order.snapshot.currency)) issue = "providerMismatch";
			if (status.transactions.reduce((sum, t) => sum + t.amount, 0) !== status.amountPaid) issue = "settlementMismatch";
			const webhookAmount = events.filter(e => e.kind === "webhook" && e.outcome === "received").reduce((sum, e) => sum + (e.amount ?? 0), 0);
			if (webhookAmount > status.amountPaid || status.amountPaid < order.settledAmount) issue = "settlementMismatch";
			if (status.amountPaid > order.snapshot.totalPrice) issue = "overpaid";
			if (status.amountPaid > 0 && status.amountPaid < order.snapshot.totalPrice) issue = "underpaid";
			if (status.status === "PAID" && (status.amountPaid !== order.snapshot.totalPrice || status.amountRemaining !== 0 || !status.transactions.length)) issue = "settlementMismatch";
		}
		if (status && !issue && status.status === "PAID" && order.fulfillmentStatus !== "issued") {
			// Even an exact payment after local expiry/cancellation requires review.
			if (order.checkoutClosedAt || order.expiresAt.getTime() <= Date.now() || ["cancelled", "expired", "failed"].includes(order.paymentStatus) || (order.snapshot.category === "vip" && order.reservation !== "held") || (order.promoId && order.promoReservation !== "held")) issue = "latePayment";
		}
		const matchedId = status && status.orderCode === order.providerOrderCode && (!order.paymentLinkId || status.id === order.paymentLinkId);
		if (status && !issue && status.amountPaid > 0 && ["CANCELLED", "EXPIRED", "FAILED"].includes(status.status)) issue = "latePayment";
		const closed = status && ["CANCELLED", "EXPIRED", "FAILED"].includes(status.status);
		await tx.update(ticketOrders).set({
			...(matchedId ? { paymentLinkId: status.id, checkoutUrl: order.checkoutUrl || checkoutUrl(status.id), settledAmount: Math.max(order.settledAmount, status.amountPaid), providerStatus: status.status,
				...(closed ? { checkoutClosedAt: sql`coalesce(${ticketOrders.checkoutClosedAt}, now())`, reservation: order.reservation === "held" ? "released" as const : order.reservation, promoReservation: order.promoReservation === "held" ? "released" as const : order.promoReservation } : {}),
				...(status.status === "PAID" && (!issue || issue === "latePayment") ? { paidAt: sql`coalesce(${ticketOrders.paidAt}, now())` } : {}),
			} : {}),
			lastVerifiedAt: sql`now()`, updatedAt: sql`now()`, issue,
			...(issue ? { paymentStatus: "review" as const, fulfillmentStatus: order.fulfillmentStatus === "issued" ? "issued" as const : "review" as const } : {}),
		}).where(eq(ticketOrders.id, order.id));
		await tx.insert(ticketPaymentEvents).values({
			id: randomUUID(), eventKey: `lookup:${order.id}:${createHash("sha256").update(JSON.stringify(status ?? { invalid: true })).digest("hex")}`,
			orderId: order.id, providerOrderCode: order.providerOrderCode, paymentLinkId: status?.id, amount: status?.amountPaid, currency: status?.currency ?? "VND", kind: "lookup", outcome: issue ?? status?.status ?? "invalid",
		}).onConflictDoNothing();
		if (issue || !status) return;
		if (status.status === "PAID") { await fulfill(tx, order); return; }
		if (order.fulfillmentStatus === "issued") {
			await tx.update(ticketOrders).set({ paymentStatus: "review", issue: "providerMismatch" }).where(eq(ticketOrders.id, order.id));
			return;
		}
		const terminal = ["CANCELLED", "EXPIRED", "FAILED"].includes(status.status);
		const expired = order.expiresAt.getTime() <= Date.now();
		const paymentStatus = status.status === "CANCELLED" ? "cancelled" : status.status === "FAILED" ? "failed" : status.status === "EXPIRED" || expired ? "expired" : status.status === "PROCESSING" ? "processing" : "pending";
		await tx.update(ticketOrders).set({ paymentStatus, fulfillmentStatus: "pending", reservation: (terminal || expired) && order.reservation === "held" ? "released" : order.reservation, promoReservation: (terminal || expired) && order.promoReservation === "held" ? "released" : order.promoReservation, issue: null }).where(eq(ticketOrders.id, order.id));
	});
}

export async function reconcileOrder(orderId: string, force = false) {
	// Persist a lease before network I/O: browser polling, staff and workers share
	// this throttle. A crashed worker's lease expires; no in-memory dependency.
	const claim = reconciliationClaim(orderId, force);
	const [order] = await db.update(ticketOrders).set(claim.set).where(claim.where).returning();
	if (!order?.reconcileLeaseId) return;
	let failed = false;
	try {
		if (!order.createAttemptedAt && order.paymentStatus === "creating") await createPaymentLink(order.id);
		await applyProviderStatus(order.id, await payos().paymentRequests.get(order.providerOrderCode), order.reconcileLeaseId);
	} catch (error) {
		failed = true;
		// No provider payload, personal data or credentials enter diagnostics.
		const issue = error instanceof APIError && (error.status === 404 || error.code === "231") ? "linkNotFound" : "verificationUnavailable";
		await db.update(ticketOrders).set({ issue }).where(and(reconciliationOwner(orderId, order.reconcileLeaseId), sql`${ticketOrders.fulfillmentStatus} <> 'issued'`, sql`${ticketOrders.paymentStatus} <> 'review'`));
	} finally {
		const completion = reconciliationCompletion(order, failed);
		await db.update(ticketOrders).set(completion.set).where(completion.where);
	}
}

const webhookData = z.object({ orderCode: z.number().int().safe().positive(), amount: z.number().int().nonnegative().max(2_000_000_000), currency: z.string(), paymentLinkId: z.string().min(1), reference: z.string().min(1), code: z.string(), desc: z.string(), description: z.string(), accountNumber: z.string(), transactionDateTime: z.string() }).passthrough();
const webhookPayload = z.object({ code: z.string(), desc: z.string(), success: z.boolean(), signature: z.string().regex(/^[a-f\d]{64}$/i), data: webhookData });

export function isInvalidWebhookError(error: unknown) {
	return error instanceof z.ZodError || error instanceof InvalidSignatureError || error instanceof WebhookError;
}

export async function receiveWebhook(raw: unknown) {
	const input = webhookPayload.parse(raw);
	const data = webhookData.parse(await payos().webhooks.verify(input));
	// Exact documented channel-confirmation sample, never a real local orderCode.
	const sample = data.orderCode === 123 && data.amount === 3000 && data.reference === "TF230204212323" && data.paymentLinkId === "124c33293c43417ab7879e14c8d9eb18";
	const orderId = await ticketTransaction(async tx => {
		const eventKey = `webhook:${data.paymentLinkId}:${data.reference}`;
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${eventKey}, 0))`);
		const [order] = await tx.select().from(ticketOrders).where(eq(ticketOrders.providerOrderCode, data.orderCode));
		const mismatch = order?.snapshot.totalPrice === 0 || !input.success || input.code !== "00" || data.code !== "00" || data.currency !== "VND" || (order?.paymentLinkId && order.paymentLinkId !== data.paymentLinkId);
		// A bank reference denotes one settlement, irrespective of webhook signatures.
		const [previous] = await tx.select().from(ticketPaymentEvents).where(eq(ticketPaymentEvents.eventKey, eventKey));
		let recorded = false;
		if (previous && (previous.amount !== data.amount || previous.currency !== data.currency || previous.providerOrderCode !== data.orderCode)) {
			const [event] = await tx.insert(ticketPaymentEvents).values({ id: randomUUID(), eventKey: `conflict:${input.signature}`, orderId: order?.id, providerOrderCode: data.orderCode, paymentLinkId: data.paymentLinkId, reference: data.reference, amount: data.amount, currency: data.currency, kind: "webhook", outcome: "mismatch" }).onConflictDoNothing().returning({ id: ticketPaymentEvents.id });
			recorded = Boolean(event);
		} else {
			const [event] = await tx.insert(ticketPaymentEvents).values({ id: randomUUID(), eventKey, orderId: order?.id, providerOrderCode: data.orderCode, paymentLinkId: data.paymentLinkId, reference: data.reference, amount: data.amount, currency: data.currency, kind: sample ? "sample" : "webhook", outcome: sample ? "sample" : !order ? "unmatched" : mismatch ? "mismatch" : "received" }).onConflictDoNothing().returning({ id: ticketPaymentEvents.id });
			recorded = Boolean(event);
		}
		if (order && order.snapshot.totalPrice > 0 && !sample && recorded) await tx.update(ticketOrders).set(reconciliationRequest()).where(eq(ticketOrders.id, order.id));
		return sample || !recorded || order?.snapshot.totalPrice === 0 ? null : order?.id;
	});
	// Receipt is already durable. The scheduled worker can finish after any failure.
	if (orderId) await reconcileOrder(orderId).catch(() => undefined);
}

export async function cancelCheckout(orderId: string, buyerId: string) {
	await rateLimit(buyerId, "payment-lookup", 12);
	const order = await ownedOrder(orderId, buyerId);
	if (order.snapshot.totalPrice === 0 || order.fulfillmentStatus === "issued") ticketError("alreadyPaid", "CONFLICT");
	// Cancellation query parameters do not reach this action. Only PayOS's signed
	// cancel/get response can release a reservation ahead of checkout expiry.
	await applyProviderStatus(order.id, await payos().paymentRequests.cancel(order.providerOrderCode, "Buyer cancellation"));
}

export async function resolveLatePayment(orderId: string, actorId: string, reason: string) {
	await reconcileOrder(orderId, true);
	return ticketTransaction(async tx => {
		const settings = await lockSales(tx);
		await releaseExpiredReservations(tx);
		const [order] = await tx.select().from(ticketOrders).where(eq(ticketOrders.id, orderId)).for("update");
		if (!order || order.fulfillmentStatus === "issued" || order.issue !== "latePayment" || order.settledAmount !== order.snapshot.totalPrice || !order.lastVerifiedAt || Date.now() - order.lastVerifiedAt.getTime() > 60_000) ticketError("resolutionNotAllowed", "CONFLICT");
		if (order.snapshot.category === "vip" && order.reservation !== "held" && order.reservation !== "consumed" && await vipUsage(tx) >= settings.vipCapacity) ticketError("vipSoldOut", "CONFLICT");
		await reacquirePromo(tx, order);
		await fulfill(tx, order);
		await audit(tx, actorId, "resolveLatePayment", orderId, reason);
	});
}

export async function runReconciliation(limit = 4) {
	await ticketTransaction(async tx => { await lockSales(tx); await releaseExpiredReservations(tx); });
	// Include recently issued/terminal orders to detect duplicate and late transfers.
	const orders = await db.select({ id: ticketOrders.id }).from(ticketOrders)
		.where(reconciliationDue())
		.orderBy(ticketOrders.nextReconcileAt).limit(limit);
	for (const order of orders) await reconcileOrder(order.id);
	return orders.length;
}
