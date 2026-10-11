import { PayOS } from "@payos/node";
import { env } from "@masc-landing/env/server";
import { ticketError } from "./core";

export function payos() {
	if (!env.PAYOS_CLIENT_ID || !env.PAYOS_API_KEY || !env.PAYOS_CHECKSUM_KEY || !env.TICKET_APP_URL) ticketError("paymentNotConfigured", "PRECONDITION_FAILED");
	return new PayOS({ clientId: env.PAYOS_CLIENT_ID, apiKey: env.PAYOS_API_KEY, checksumKey: env.PAYOS_CHECKSUM_KEY, timeout: 12_000, maxRetries: 0, logLevel: "off" });
}

export function orderReturnUrl(orderId: string) {
	const url = new URL(`/tickets/orders/${encodeURIComponent(orderId)}`, env.TICKET_APP_URL);
	return url.toString();
}

export function checkoutUrl(linkId: string) {
	return `https://pay.payos.vn/web/${encodeURIComponent(linkId)}`;
}

export function validCheckoutUrl(value: string) {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname === "pay.payos.vn" && !url.username && !url.password;
	} catch { return false; }
}
