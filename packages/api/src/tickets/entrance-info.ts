import { db } from "@masc-landing/db";
import { admissionTickets, giftBatches, salesLogs, ticketOrders } from "@masc-landing/db/schema/tickets";
import { desc, eq, sql } from "drizzle-orm";

// Explicitly select operational fields; admission credentials never leave this query.
export async function listEntranceInfo() {
	return db.select({
		id: admissionTickets.id, source: admissionTickets.source, category: admissionTickets.category,
		ordinal: admissionTickets.ordinal, benefits: admissionTickets.benefits, validity: admissionTickets.validity,
		createdAt: admissionTickets.createdAt, acceptedCount: admissionTickets.acceptedCount,
		recipientName: admissionTickets.recipientName, recipientEmail: admissionTickets.recipientEmail, recipientPhone: admissionTickets.recipientPhone,
		buyerName: sql<string | null>`coalesce(${ticketOrders.buyerName}, ${salesLogs.buyerName})`,
		buyerEmail: sql<string | null>`coalesce(${ticketOrders.buyerEmail}, ${salesLogs.buyerEmail})`,
		buyerPhone: sql<string | null>`coalesce(${ticketOrders.buyerPhone}, ${salesLogs.buyerPhone})`,
		orderId: ticketOrders.id, orderCode: sql<string | null>`${ticketOrders.providerOrderCode}::text`,
		packageName: sql<string | null>`${ticketOrders.snapshot}->>'packageName'`,
		orderQuantity: sql<number | null>`(${ticketOrders.snapshot}->>'quantity')::int`,
		paymentStatus: ticketOrders.paymentStatus, fulfillmentStatus: ticketOrders.fulfillmentStatus,
		orderPrice: sql<number | null>`(${ticketOrders.snapshot}->>'totalPrice')::int`, paidAt: ticketOrders.paidAt,
		promoCode: sql<string | null>`${ticketOrders.snapshot}->'promo'->>'code'`, referralCode: ticketOrders.referralCode,
		batchId: giftBatches.id, batchTitle: giftBatches.title, batchNote: giftBatches.note,
		salesLogId: salesLogs.id, salesQuantity: salesLogs.quantity, amountReceived: salesLogs.amountReceived,
		issuerName: salesLogs.creatorName, issuerEmail: salesLogs.creatorEmail,
	}).from(admissionTickets)
		.leftJoin(ticketOrders, eq(admissionTickets.orderId, ticketOrders.id))
		.leftJoin(giftBatches, eq(admissionTickets.batchId, giftBatches.id))
		.leftJoin(salesLogs, eq(admissionTickets.salesLogId, salesLogs.id))
		.orderBy(desc(admissionTickets.createdAt), admissionTickets.id);
}
