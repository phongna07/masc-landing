import { randomUUID } from "node:crypto";
import { ticketOrders } from "@masc-landing/db/schema/tickets";
import { and, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

type ReconciliationOrder = Pick<typeof ticketOrders.$inferSelect, "id" | "reconcileLeaseId" | "reconcileRequestId" | "reconcileAttempts" | "fulfillmentStatus">;

export function reconciliationRequest() {
	// Replaced only by a newly recorded receipt, never by duplicate delivery.
	return { reconcileRequestId: randomUUID(), nextReconcileAt: sql`now()` };
}

export function reconciliationOwner(orderId: string, leaseId: string) {
	return and(eq(ticketOrders.id, orderId), eq(ticketOrders.reconcileLeaseId, leaseId));
}

export function reconciliationClaim(orderId: string, force = false) {
	return {
		set: { reconcileLeaseId: randomUUID(), reconcileLeaseUntil: sql`now() + interval '30 seconds'` },
		where: and(sql`(${ticketOrders.snapshot}->>'totalPrice')::integer > 0`, eq(ticketOrders.id, orderId), or(isNull(ticketOrders.reconcileLeaseUntil), lte(ticketOrders.reconcileLeaseUntil, sql`now()`)), force ? undefined : and(lte(ticketOrders.nextReconcileAt, sql`now()`), or(isNull(ticketOrders.lastVerifiedAt), sql`${ticketOrders.lastVerifiedAt} < now() - interval '10 seconds'`))),
	};
}

export function reconciliationCompletion(order: ReconciliationOrder, failed: boolean) {
	const seconds = !failed && order.fulfillmentStatus === "issued" ? 3600 : Math.min(3600, 30 * 2 ** Math.min(order.reconcileAttempts, 7));
	const notified = sql`${ticketOrders.reconcileRequestId} is distinct from ${order.reconcileRequestId}::text`;
	return {
		set: {
			reconcileLeaseId: null,
			reconcileLeaseUntil: null,
			reconcileAttempts: sql`${ticketOrders.reconcileAttempts} + 1`,
			// Compare the durable marker captured BEFORE the provider request. Even
			// a notification seen by applyProviderStatus needs another fresh lookup.
			nextReconcileAt: sql`case when ${notified} then now() else now() + ${seconds} * interval '1 second' end`,
			// Keep failed work durable, including terminal orders older than 90 days.
			reconcileRequestId: failed ? ticketOrders.reconcileRequestId : sql`case when ${notified} then ${ticketOrders.reconcileRequestId} else null end`,
		},
		where: order.reconcileLeaseId ? reconciliationOwner(order.id, order.reconcileLeaseId) : sql`false`,
	};
}

export function reconciliationDue() {
	return and(sql`(${ticketOrders.snapshot}->>'totalPrice')::integer > 0`, lte(ticketOrders.nextReconcileAt, sql`now()`), or(
		sql`${ticketOrders.createdAt} > now() - interval '90 days'`,
		sql`${ticketOrders.paymentStatus} in ('creating', 'pending', 'processing', 'review')`,
		isNotNull(ticketOrders.reconcileRequestId),
		sql`exists (select 1 from ticket_payment_events e where e.order_id = ${ticketOrders.id} and e.kind = 'webhook' and e.created_at > coalesce(${ticketOrders.lastVerifiedAt}, 'epoch'::timestamptz))`,
	), or(isNull(ticketOrders.reconcileLeaseUntil), lte(ticketOrders.reconcileLeaseUntil, sql`now()`)));
}
