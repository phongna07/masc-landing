import TicketShell from "@/components/tickets/ticket-shell";
import { requireTicketBuyer } from "@/lib/ticket-session";
import MyTickets from "./my-tickets";

export default async function MyTicketsPage() {
	await requireTicketBuyer("/my-tickets");
	return <TicketShell><MyTickets /></TicketShell>;
}
