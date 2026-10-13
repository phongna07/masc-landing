import { getAdminByEmail } from "@masc-landing/api/admin-access";
import { canAccessAdminArea } from "@masc-landing/api/admin-roles";
import { rateLimit } from "@masc-landing/api/tickets/core";
import { previewTicketTemplatesInput } from "@masc-landing/api/tickets/template-input";
import { getTicketTemplatePreview } from "@masc-landing/api/tickets/template-settings";
import { TRPCError } from "@trpc/server";
import { getFreshServerSession } from "@/lib/server-session";
import { ticketMessages } from "@/lib/ticket-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
	const session = await getFreshServerSession();
	if (!session) return Response.json({ message: "operationFailed" }, { status: 401, headers });
	const admin = await getAdminByEmail(session.user.email);
	if (!admin || !canAccessAdminArea(admin.role, "tickets")) return Response.json({ message: "operationFailed" }, { status: 403, headers });
	if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ message: "operationFailed" }, { status: 403, headers });
	try {
		// Previewing is read-only; no sales initialization, jobs or emails are created.
		await rateLimit(session.user.id, "ticket-template-preview", 120);
		const raw = await request.text();
		if (raw.length > 100_000) return Response.json({ message: "invalidTemplateConfig" }, { status: 413, headers });
		const parsed = previewTicketTemplatesInput.safeParse(JSON.parse(raw));
		if (!parsed.success) return Response.json({ message: "invalidTemplateConfig" }, { status: 400, headers });
		const result = await getTicketTemplatePreview(parsed.data, ticketMessages);
		return Response.json(result, { headers });
	} catch (error) {
		const message = error instanceof TRPCError ? error.message : error instanceof SyntaxError ? "invalidTemplateConfig" : "operationFailed";
		return Response.json({ message }, { status: error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS" ? 429 : message === "operationFailed" ? 500 : 400, headers });
	}
}
