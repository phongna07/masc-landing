import { canAccessAdminArea } from "@masc-landing/api/admin-roles";
import { requireAdminArea } from "../admin-auth";
import SalesLogs from "@/components/tickets/sales-logs";
import "@/components/tickets/tickets.css";

export default async function SalesLogPage() {
	const admin = await requireAdminArea("salesLog");
	return <div className="ticket-admin"><SalesLogs isRoot={canAccessAdminArea(admin.role, "tickets")} /></div>;
}
