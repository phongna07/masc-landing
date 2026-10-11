import { db } from "@masc-landing/db";
import { ticketOrders } from "@masc-landing/db/schema/tickets";
import { desc } from "drizzle-orm";
import { ticketTransaction } from "@masc-landing/db/ticket-transaction";
import { audit } from "./core";

export async function exportOrders(actorId: string) {
	const rows = await db.select({ id: ticketOrders.id, providerOrder: ticketOrders.providerOrderCode, buyerEmail: ticketOrders.buyerEmail, snapshot: ticketOrders.snapshot, settled: ticketOrders.settledAmount, payment: ticketOrders.paymentStatus, fulfillment: ticketOrders.fulfillmentStatus, created: ticketOrders.createdAt }).from(ticketOrders).orderBy(desc(ticketOrders.createdAt)).limit(5000);
	await ticketTransaction(tx => audit(tx, actorId, "ordersExported", null));
	return rows;
}
