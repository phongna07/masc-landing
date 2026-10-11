import { db } from "@masc-landing/db";
import { admissionTickets, ticketAudit, ticketCheckIns, ticketPaymentEvents } from "@masc-landing/db/schema/tickets";
import { ticketTransaction } from "@masc-landing/db/ticket-transaction";
import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminAreaProcedure, freshProtectedProcedure, router } from "../index";
import { accessibleTicket, audit, buyerOrder, getTicketConfig, ownedOrder, rateLimit } from "../tickets/core";
import { confirmCheckIn, lookupTicket } from "../tickets/check-in";
import { batchDetail, batchInput, changeTicket, createGiftBatch, enqueueDelivery, listBatches, listOrders, orderDetail, pageInput, recipientInput, recordRefund, recordResolution, refundInput, setEntranceStaff, settingsInput, ticketHistory, updateRecipient, updateSettings } from "../tickets/management";
import { cancelCheckout, checkoutInput, reconcileOrder, resolveLatePayment, runReconciliation, startCheckout } from "../tickets/payments";
import { payos } from "../tickets/payos";
import { env } from "@masc-landing/env/server";

// Do not surface SQL/provider errors that could contain admission credentials.
const safeErrors = async <T>(work: () => Promise<T>): Promise<T> => {
	try { return await work(); } catch (error) {
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "operationFailed" });
	}
};
const buyer = freshProtectedProcedure;
const root = adminAreaProcedure("tickets");
const staff = adminAreaProcedure("checkIn");
const idInput = z.object({ id: z.uuid() });
const historyInput = idInput.extend({ page: z.number().int().min(0).max(100000).default(0) });

export const ticketsRouter = router({
	config: buyer.query(() => safeErrors(getTicketConfig)),
	checkout: buyer.input(checkoutInput).mutation(({ ctx, input }) => safeErrors(async () => ({ id: (await startCheckout(ctx.session.user, input)).id }))),
	mine: buyer.input(pageInput).query(({ ctx, input }) => safeErrors(async () => {
		const page = await listOrders(input, ctx.session.user.id);
		return { ...page, items: page.items.map(order => ({ ...buyerOrder(order), tickets: order.tickets })) };
	})),
	order: buyer.input(idInput).query(({ ctx, input }) => safeErrors(async () => {
		const order = await ownedOrder(input.id, ctx.session.user.id);
		const tickets = await db.select().from(admissionTickets).where(and(eq(admissionTickets.orderId, order.id), eq(admissionTickets.ownerId, ctx.session.user.id))).orderBy(admissionTickets.ordinal);
		return { order: buyerOrder(order), tickets };
	})),
	verifyOrder: buyer.input(idInput).mutation(({ ctx, input }) => safeErrors(async () => {
		await rateLimit(ctx.session.user.id, "payment-lookup", 12);
		await ownedOrder(input.id, ctx.session.user.id);
		await reconcileOrder(input.id);
	})),
	cancel: buyer.input(idInput).mutation(({ ctx, input }) => safeErrors(() => cancelCheckout(input.id, ctx.session.user.id))),
	history: buyer.input(historyInput).query(({ ctx, input }) => safeErrors(async () => {
		await accessibleTicket(input.id, ctx.session.user.id, false);
		const history = await ticketHistory(input.id, input.page);
		return { checkIns: history.checkIns.map(({ outcome, createdAt, isOverride }) => ({ outcome, createdAt, isOverride })), total: history.checkInTotal, pageSize: history.pageSize };
	})),
	adminConfig: root.query(() => safeErrors(getTicketConfig)),
	stats: root.query(() => safeErrors(async () => {
		const [tickets] = await db.select({ purchased: sql<number>`count(*) filter (where ${admissionTickets.source} = 'purchased')::int`, gifted: sql<number>`count(*) filter (where ${admissionTickets.source} = 'gifted')::int`, revoked: sql<number>`count(*) filter (where ${admissionTickets.validity} = 'revoked')::int` }).from(admissionTickets);
		const [admissions] = await db.select({ accepted: sql<number>`count(*) filter (where ${ticketCheckIns.outcome} = 'accepted')::int` }).from(ticketCheckIns);
		return { ...tickets!, ...admissions! };
	})),
	settings: root.input(settingsInput).mutation(({ ctx, input }) => safeErrors(() => updateSettings(input, ctx.session.user.id))),
	orders: root.input(pageInput).query(({ input }) => safeErrors(() => listOrders(input))),
	orderDetail: root.input(idInput).query(({ input }) => safeErrors(() => orderDetail(input.id))),
	batches: root.input(pageInput).query(({ input }) => safeErrors(() => listBatches(input))),
	batchDetail: root.input(idInput).query(({ input }) => safeErrors(() => batchDetail(input.id))),
	createBatch: root.input(batchInput).mutation(({ ctx, input }) => safeErrors(() => createGiftBatch(input, ctx.session.user.id))),
	recipient: root.input(recipientInput).mutation(({ ctx, input }) => safeErrors(() => updateRecipient(input, ctx.session.user.id))),
	changeTicket: root.input(z.object({ ticketId: z.uuid(), action: z.enum(["revoke", "replace"]), reason: z.string().trim().min(1).max(1000) })).mutation(({ ctx, input }) => safeErrors(() => changeTicket(input.ticketId, input.action, input.reason, ctx.session.user.id))),
	refund: root.input(refundInput).mutation(({ ctx, input }) => safeErrors(() => recordRefund(input, ctx.session.user.id))),
	deliver: root.input(z.object({ orderId: z.uuid().optional(), ticketId: z.uuid().optional(), requestKey: z.uuid(), locale: z.enum(["en", "vi"]).optional() }).refine(input => Boolean(input.orderId) !== Boolean(input.ticketId))).mutation(({ ctx, input }) => safeErrors(() => enqueueDelivery(input, ctx.session.user.id))),
	adminHistory: root.input(historyInput).query(({ input }) => safeErrors(() => ticketHistory(input.id, input.page))),
	reconcile: root.input(z.object({ id: z.uuid().optional() })).mutation(({ ctx, input }) => safeErrors(async () => {
		await rateLimit(ctx.session.user.id, "admin-reconcile", 6);
		if (input.id) await reconcileOrder(input.id, true); else await runReconciliation();
		await ticketTransaction(tx => audit(tx, ctx.session.user.id, "reconciled", input.id ?? null));
	})),
	resolveLate: root.input(z.object({ id: z.uuid(), reason: z.string().trim().min(1).max(1000) })).mutation(({ ctx, input }) => safeErrors(() => resolveLatePayment(input.id, ctx.session.user.id, input.reason))),
	recordResolution: root.input(z.object({ id: z.uuid(), reason: z.string().trim().min(1).max(1000) })).mutation(({ ctx, input }) => safeErrors(() => recordResolution(input.id, input.reason, ctx.session.user.id))),
	setEntranceStaff: root.input(z.object({ email: z.email(), enabled: z.boolean() })).mutation(({ ctx, input }) => safeErrors(() => setEntranceStaff(input.email, input.enabled, ctx.session.user.id))),
	confirmWebhook: root.mutation(({ ctx }) => safeErrors(async () => {
		await rateLimit(ctx.session.user.id, "webhook-confirm", 2);
		const result = await payos().webhooks.confirm(new URL("/api/tickets/payos/webhook", env.TICKET_APP_URL).toString());
		await ticketTransaction(tx => audit(tx, ctx.session.user.id, "webhookConfirmed", null));
		return { webhookUrl: result.webhookUrl };
	})),
	activity: root.input(z.object({ page: z.number().int().min(0) })).query(({ input }) => safeErrors(() => db.select().from(ticketAudit).orderBy(desc(ticketAudit.createdAt)).limit(30).offset(input.page * 30))),
	alerts: root.query(() => safeErrors(() => db.select().from(ticketPaymentEvents).where(sql`${ticketPaymentEvents.outcome} in ('unmatched', 'mismatch')`).orderBy(desc(ticketPaymentEvents.createdAt)).limit(100))),
	lookup: staff.input(z.object({ code: z.string().max(120), requestKey: z.uuid() })).mutation(({ ctx, input }) => safeErrors(() => lookupTicket(ctx.session.user.id, input.code, input.requestKey))),
	checkIn: staff.input(z.object({ ticketId: z.uuid(), credentialVersion: z.number().int().positive(), requestKey: z.uuid(), overrideReason: z.string().trim().min(1).max(1000).optional() })).mutation(({ ctx, input }) => safeErrors(() => confirmCheckIn(input, ctx.session.user.id, ctx.admin.role === "root"))),
});
