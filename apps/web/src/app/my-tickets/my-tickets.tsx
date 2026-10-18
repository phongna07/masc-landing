"use client";

import { Button } from "@masc-landing/ui/components/button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { TicketIcon, ReceiptTextIcon } from "lucide-react";
import { trpc } from "@/utils/trpc";
import TicketCard from "@/components/tickets/ticket-card";
import { Pagination, TicketHeading, TicketLoading, TicketEmpty, TicketError } from "@/components/tickets/ticket-ui";

export default function MyTickets() {
	const t = useTranslations("Tickets");
	const [page, setPage] = useState(0);
	const orders = useQuery(trpc.tickets.mine.queryOptions({ page, search: "", status: "", category: "" }));
	const issued = orders.data?.items.filter(o => o.fulfillmentStatus === "issued") ?? [];
	const pending = orders.data?.items.filter(o => o.fulfillmentStatus !== "issued") ?? [];
	return <><TicketHeading title={t("myTickets")} description={t("ownershipNotice")} action={<Button nativeButton={false} render={<Link href="/tickets" />} className="ticket-heading-action ticket-button-primary" size="lg"><TicketIcon aria-hidden="true" />{t("buy")}</Button>} /><TicketError error={orders.error} />
		{orders.isPending && <TicketLoading />}{orders.data?.total === 0 && <TicketEmpty message={t("noOrders")} />}
		{orders.data && orders.data.total > 0 && <><h2>{t("pendingOrders")}</h2>{pending.length === 0 && <TicketEmpty message={t("noPending")} />}<div className="ticket-grid ticket-order-grid">{pending.map(order => <article className="ticket-panel" key={order.id}><div className="ticket-order-header"><div><h3>{order.snapshot.packageName} · {t("quantity", { count: order.snapshot.quantity })}</h3><p>{t(`payment.${order.paymentStatus}`)} · {t(`fulfillment.${order.fulfillmentStatus}`)}</p></div><Button className="ticket-button-neutral" nativeButton={false} render={<Link href={`/tickets/orders/${order.id}`} />} variant="outline"><ReceiptTextIcon aria-hidden="true" />{t("orderStatus")}</Button></div>{order.issue && <p className="ticket-warning">{t.has(`issues.${order.issue}`) ? t(`issues.${order.issue}`) : t("issues.providerMismatch")}</p>}</article>)}</div>
		<h2>{t("issuedOrders")}</h2>{orders.data && issued.length === 0 && <TicketEmpty message={t("noIssued")} />}{issued.map(order => <section key={order.id} className="ticket-panel"><div className="ticket-order-header"><div><h3>{order.snapshot.packageName} · {t("quantity", { count: order.snapshot.quantity })}</h3><p>{t(`payment.${order.paymentStatus}`)}</p></div><Button className="ticket-button-neutral" nativeButton={false} render={<Link href={`/tickets/orders/${order.id}`} />} variant="outline"><ReceiptTextIcon aria-hidden="true" />{t("orderStatus")}</Button></div><div className="ticket-grid ticket-card-grid">{order.tickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} />)}</div></section>)}
		</>}{orders.data && orders.data.total > orders.data.pageSize && <Pagination page={page} total={orders.data.total} pageSize={orders.data.pageSize} setPage={setPage} />}
	</>;
}
