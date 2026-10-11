import { timingSafeEqual } from "node:crypto";
import { env } from "@masc-landing/env/server";
import { runReconciliation } from "@masc-landing/api/tickets/payments";
import { runTicketEmailJobs } from "@masc-landing/api/tickets/email";
import { ticketMessages } from "@/lib/ticket-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
	const supplied = Buffer.from(request.headers.get("authorization") ?? "");
	const expected = Buffer.from(`Bearer ${env.TICKET_WORKER_SECRET ?? ""}`);
	if (!env.TICKET_WORKER_SECRET || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return new Response(null, { status: 401 });
	try {
		const reconciled = await runReconciliation(4);
		const email = await runTicketEmailJobs(ticketMessages, 2);
		return Response.json({ reconciled, email }, { headers: { "Cache-Control": "no-store" } });
	} catch { return new Response(null, { status: 503 }); }
}
