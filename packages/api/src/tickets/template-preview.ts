import type { z } from "zod";
import type { Order, Ticket } from "./core";
import { ticketPng } from "./artwork";
import { renderTicketEmail } from "./email-template";
import { previewTicketTemplatesInput } from "./template-input";

export function sampleTicketDelivery(input: Pick<z.infer<typeof previewTicketTemplatesInput>, "category" | "validity" | "source" | "quantity">) {
	const tickets: Ticket[] = Array.from({ length: input.source === "gifted" ? 1 : input.quantity }, (_, index) => ({
		id: `preview-ticket-${index + 1}`, source: input.source, category: input.category,
		// Intentionally invalid admission credentials. Previews never query tickets.
		code: `PREVIEW-ONLY-${index + 1}`, ordinal: index + 1, validity: input.validity,
		benefits: input.category === "vip" ? ["networkingLunch"] : [],
		orderId: input.source === "purchased" ? "PREVIEW-ORDER" : null, batchId: input.source === "gifted" ? "PREVIEW-BATCH" : null,
		salesLogId: null, ownerId: null, recipientName: "Alex", recipientPhone: null, recipientEmail: null,
		acceptedCount: 0, credentialVersion: 1, createdAt: new Date(0),
	}));
	const packageName = input.category === "vip" ? "VIP" : input.quantity === 3 ? "Platinum" : input.quantity === 2 ? "Golden" : "Silver";
	const order: Order | undefined = input.source === "purchased" ? {
		id: "PREVIEW-ORDER", buyerId: "preview", requestKey: "preview", providerOrderCode: 0,
		referralCode: null, promoId: null, promoReservation: "none", paymentLinkId: null, checkoutUrl: null, buyerEmail: "preview@example.invalid", buyerName: "Alex", buyerPhone: "0901234567",
		locale: "vi", paymentStatus: "paid", fulfillmentStatus: "issued", reservation: "none", settledAmount: 0, issue: null,
		snapshot: { packageName, category: input.category, quantity: tickets.length, benefits: tickets[0]!.benefits, currency: "VND", totalPrice: input.category === "vip" ? 199000 * tickets.length : input.quantity === 3 ? 349000 : input.quantity === 2 ? 249000 : 129000 },
		expiresAt: new Date(0), paidAt: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), createAttemptedAt: null,
		reconcileAttempts: 0, nextReconcileAt: new Date(0), reconcileLeaseUntil: null, reconcileLeaseId: null, reconcileRequestId: null,
		lastVerifiedAt: null, providerStatus: null, checkoutClosedAt: null, resolutionNote: null, resolvedAt: null, resolvedBy: null,
	} : undefined;
	return { tickets, order };
}

export async function previewTicketTemplates(input: z.infer<typeof previewTicketTemplatesInput>) {
	const { tickets, order } = sampleTicketDelivery(input);
	const email = renderTicketEmail(tickets, order);
	const png = await ticketPng(tickets[0]!);
	return { ...email, png: `data:image/png;base64,${png.toString("base64")}` };
}
