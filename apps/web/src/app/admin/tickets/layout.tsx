import { requireAdminArea } from "../admin-auth";
import TicketNavigation from "@/components/tickets/ticket-navigation";
import "@/components/tickets/tickets.css";

export default async function TicketAdminLayout({ children }: { children: React.ReactNode }) {
	await requireAdminArea("tickets");
	return <div className="ticket-admin"><TicketNavigation admin />{children}</div>;
}
