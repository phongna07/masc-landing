import { canAccessAdminArea } from "@masc-landing/api/admin-roles";
import { getLocale } from "next-intl/server";
import { getAdminByEmail } from "@masc-landing/api/admin-access";
import { renderOrderCsv } from "@masc-landing/api/tickets/order-csv";
import { exportOrders } from "@masc-landing/api/tickets/export";
import { rateLimit } from "@masc-landing/api/tickets/core";
import { getFreshServerSession } from "@/lib/server-session";
import en from "../../../../../messages/en.json";
import vi from "../../../../../messages/vi.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
	const session = await getFreshServerSession();
	if (!session) return new Response(null, { status: 401 });
	const admin = await getAdminByEmail(session.user.email);
	if (!admin || !canAccessAdminArea(admin.role, "tickets")) return new Response(null, { status: 403 });
	try {
		await rateLimit(session.user.id, "ticket-export", 2);
		const locale = await getLocale();
		const copy = (locale === "en" ? en : vi).Tickets;
		const rows = await exportOrders(session.user.id);
		return new Response(renderOrderCsv(rows, copy), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="ticket-orders.csv"', "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
	} catch { return new Response(null, { status: 500 }); }
}
