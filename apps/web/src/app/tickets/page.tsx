import { requireTicketBuyer } from "@/lib/ticket-session";
import TicketShell from "@/components/tickets/ticket-shell";
import PurchaseTickets from "./purchase-tickets";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
	const { code } = await searchParams;
	const referralCode = (Array.isArray(code) ? code[0] : code) ?? "";
	const query = new URLSearchParams();
	if (referralCode) query.set("code", referralCode);
	await requireTicketBuyer(query.size ? `/tickets?${query}` : "/tickets");
	return <TicketShell showNavigation={false}><PurchaseTickets key={referralCode} initialReferralCode={referralCode} /></TicketShell>;
}
