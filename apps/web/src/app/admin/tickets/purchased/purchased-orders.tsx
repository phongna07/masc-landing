"use client";

import { DownloadIcon } from "lucide-react";

import { Button } from "@masc-landing/ui/components/button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import AdminFilters, { emptyTicketFilters } from "@/components/tickets/admin-filters";
import { Pagination, TicketHeading, TicketLoading, TicketEmpty, TicketError } from "@/components/tickets/ticket-ui";
import { useTicketDownload } from "@/components/tickets/use-ticket-download";

export default function PurchasedOrders() {
	const t = useTranslations("Tickets");
	const { download, isDownloading } = useTicketDownload();
	const locale = useLocale();
	const [page, setPage] = useState(0);
	const [filters, setFilters] = useState(emptyTicketFilters);
	const orders = useQuery(trpc.tickets.orders.queryOptions({ ...filters, page }));
	return <><TicketHeading admin title={t("purchased")} description={t("purchasedIntro")} /><AdminFilters value={filters} onChange={value => { setFilters(value); setPage(0); }} /><div className="ticket-toolbar"><Button className="ticket-button-utility" type="button" disabled={isDownloading} aria-busy={isDownloading} onClick={() => void download("/api/tickets/export", "ticket-orders.csv", "text/csv", "exportFailed")} variant="outline"><DownloadIcon aria-hidden="true" />{t("exportOrders")}</Button><p>{t("exportHelp")}</p></div><TicketError error={orders.error} />{orders.isPending && <TicketLoading />}{orders.data?.total === 0 && <TicketEmpty message={t("noMatchingOrders")} />}
		<div className="ticket-scroll"><table className="admin-table ticket-table"><thead><tr>{["order", "buyerContact", "package", "paymentLabel", "fulfillmentLabel", "issuedCount", "emailDelivery"].map(key => <th scope="col" key={key}>{t(key)}</th>)}</tr></thead><tbody>{orders.data?.items.map(order => <tr key={order.id}><td><Link className="admin-row-link" href={`/admin/tickets/purchased/${order.id}`}>{order.providerOrderCode}</Link></td><td><strong>{order.buyerName || "—"}</strong><span>{order.buyerEmail}</span></td><td><strong>{order.snapshot.packageName}</strong><span>{new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(order.snapshot.totalPrice)}</span></td><td><span className={`admin-badge ${order.paymentStatus === "paid" ? "is-success" : ["review", "failed"].includes(order.paymentStatus) ? "is-danger" : ""}`}>{t(`payment.${order.paymentStatus}`)}</span>{order.issue && <p className="ticket-warning">{t.has(`issues.${order.issue}`) ? t(`issues.${order.issue}`) : t("issues.providerMismatch")}</p>}</td><td><span className={`admin-badge ${order.fulfillmentStatus === "issued" ? "is-success" : order.fulfillmentStatus === "review" ? "is-danger" : ""}`}>{t(`fulfillment.${order.fulfillmentStatus}`)}</span></td><td>{order.tickets.length}/{order.snapshot.quantity}</td><td>{order.emailJobs[0] ? t(`emailStatus.${order.emailJobs[0].status}`) : "—"}</td></tr>)}</tbody></table></div>{orders.data && <Pagination page={page} total={orders.data.total} pageSize={orders.data.pageSize} setPage={setPage} />}
	</>;
}
