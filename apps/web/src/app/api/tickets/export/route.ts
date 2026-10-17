import { canAccessAdminArea } from "@masc-landing/api/admin-roles";
import { getLocale } from "next-intl/server";
import { getAdminByEmail } from "@masc-landing/api/admin-access";
import { exportOrders } from "@masc-landing/api/tickets/export";
import { rateLimit } from "@masc-landing/api/tickets/core";
import { getFreshServerSession } from "@/lib/server-session";
import en from "../../../../../messages/en.json";
import vi from "../../../../../messages/vi.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function csv(value: string | number) {
	let text = String(value);
	if (/^[=+@\-\t\r\n]/.test(text)) text = "'" + text;
	return `"${text.replaceAll('"', '""')}"`;
}
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
		const header = Object.values(copy.exportHeaders).map(csv).join(",");
		const body = rows.map(row => [row.id, row.providerOrder, row.buyerEmail, row.snapshot.packageName, copy.categories[row.snapshot.category], row.snapshot.quantity, row.snapshot.totalPrice, row.settled, copy.payment[row.payment], copy.fulfillment[row.fulfillment], row.created.toISOString()].map(csv).join(",")).join("\r\n");
		return new Response(`\ufeff${header}\r\n${body}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="ticket-orders.csv"', "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
	} catch { return new Response(null, { status: 500 }); }
}
