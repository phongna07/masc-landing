import { getAdminByEmail } from "@masc-landing/api/admin-access";
import { accessibleTicket, rateLimit } from "@masc-landing/api/tickets/core";
import { ticketPng } from "@masc-landing/api/tickets/artwork";
import { getFreshServerSession } from "@/lib/server-session";
import { ticketMessages } from "@/lib/ticket-messages";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const session = await getFreshServerSession();
	if (!session) return new Response(null, { status: 401, headers: privateHeaders });
	try {
		const id = z.uuid().parse((await params).id);
		const admin = await getAdminByEmail(session.user.email);
		await rateLimit(session.user.id, "ticket-images", 240);
		const ticket = await accessibleTicket(id, session.user.id, admin?.role === "root");
		const search = new URL(request.url).searchParams;
		const locale = search.get("locale") === "en" ? "en" : "vi";
		const png = await ticketPng(ticket, locale, ticketMessages[locale]);
		return new Response(new Uint8Array(png), { headers: { ...privateHeaders, "Content-Type": "image/png", "Content-Disposition": `${search.get("download") === "1" ? "attachment" : "inline"}; filename="ticket-${ticket.ordinal}.png"` } });
	} catch (error) {
		return new Response(null, { status: error instanceof TRPCError && error.code === "NOT_FOUND" ? 404 : error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS" ? 429 : 500, headers: privateHeaders });
	}
}
