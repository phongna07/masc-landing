import { isInvalidWebhookError, receiveWebhook } from "@masc-landing/api/tickets/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	// Bounded input; never log webhook bodies, bank-account information or keys.
	if (Number(request.headers.get("content-length") ?? 0) > 32768) return new Response(null, { status: 413 });
	try {
		const body = await request.text();
		if (body.length > 32768) return new Response(null, { status: 413 });
		await receiveWebhook(JSON.parse(body));
		return Response.json({ received: true });
	} catch (error) {
		const invalid = error instanceof SyntaxError || isInvalidWebhookError(error);
		// 5xx tells PayOS to retry if persistence/configuration is unavailable.
		return new Response(null, { status: invalid ? 400 : 503 });
	}
}
