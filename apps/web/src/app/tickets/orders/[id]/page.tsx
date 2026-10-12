import { notFound } from "next/navigation";
import { z } from "zod";
import TicketShell from "@/components/tickets/ticket-shell";
import { requireTicketBuyer } from "@/lib/ticket-session";
import OrderStatus from "./order-status";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!z.uuid().safeParse(id).success) notFound();
	await requireTicketBuyer(`/tickets/orders/${id}`);
	return <TicketShell showNavigation={false}><OrderStatus id={id} /></TicketShell>;
}
