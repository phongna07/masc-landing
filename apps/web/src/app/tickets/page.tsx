import { requireTicketBuyer } from "@/lib/ticket-session";
import TicketShell from "@/components/tickets/ticket-shell";
import PurchaseTickets from "./purchase-tickets";

export default async function TicketsPage() {
	await requireTicketBuyer("/tickets");
	return <TicketShell showNavigation={false}><PurchaseTickets /></TicketShell>;
}
