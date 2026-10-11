"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { Input } from "@masc-landing/ui/components/input";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { trpc } from "@/utils/trpc";
import TicketCard, { EventTime } from "@/components/tickets/ticket-card";
import AdminTicketControls from "@/components/tickets/admin-ticket-controls";
import { TicketHeading, TicketLoading, TicketError } from "@/components/tickets/ticket-ui";

export default function AdminOrderDetail({ id }: { id: string }) {
	const t = useTranslations("Tickets");
	const locale = useLocale();
	const detail = useQuery(trpc.tickets.orderDetail.queryOptions({ id }));
	const refresh = () => { void detail.refetch(); };
	const reconcile = useMutation(trpc.tickets.reconcile.mutationOptions({ onSuccess: refresh }));
	const deliver = useMutation(trpc.tickets.deliver.mutationOptions({ onSuccess: refresh }));
	const resolve = useMutation(trpc.tickets.resolveLate.mutationOptions({ onSuccess: refresh }));
	const refund = useMutation(trpc.tickets.refund.mutationOptions({ onSuccess: refresh }));
	const resolution = useMutation(trpc.tickets.recordResolution.mutationOptions({ onSuccess: refresh }));
	const [reason, setReason] = useState("");
	const [refundStatus, setRefundStatus] = useState<"pending" | "completed" | "failed">("completed");
	const [amount, setAmount] = useState(0);
	const [reference, setReference] = useState("");
	const refundKey = useRef<string | null>(null);
	const order = detail.data?.order;
	return <><TicketHeading admin title={t("orderDetails")} description={t("orderDetailsIntro")} /><TicketError error={detail.error} />{detail.isPending && <TicketLoading />}{order && <><section className="ticket-panel"><h2>{order.providerOrderCode} · {order.snapshot.packageName}</h2><p>{order.id}</p><p>{t("buyerContact")}: {order.buyerName || "—"} · {order.buyerPhone || "—"} · {order.buyerEmail}</p><p>{t(`payment.${order.paymentStatus}`)} · {t(`fulfillment.${order.fulfillmentStatus}`)}</p><p>{t("quantity", { count: order.snapshot.quantity })} · {t(`categories.${order.snapshot.category}`)}</p><p>{t("total")}: {new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(order.snapshot.totalPrice)}</p><p>{t("settledAmount")}: {order.settledAmount} VND</p>{order.issue && <p className="ticket-warning">{t.has(`issues.${order.issue}`) ? t(`issues.${order.issue}`) : t("issues.providerMismatch")}</p>}<p>{t("expires")}: <EventTime value={order.expiresAt} timezone={order.snapshot.event.timezone} /></p><div className="ticket-actions"><Button type="button" disabled={reconcile.isPending} onClick={() => reconcile.mutate({ id })}>{t("reconcile")}</Button><Button type="button" disabled={order.fulfillmentStatus !== "issued" || deliver.isPending} onClick={() => deliver.mutate({ orderId: id, requestKey: crypto.randomUUID() })}>{t("resendEmail")}</Button></div><TicketError error={reconcile.error || deliver.error} /></section>
			{order.issue === "latePayment" && order.fulfillmentStatus !== "issued" && <section className="ticket-panel"><h2>{t("resolveLate")}</h2><p>{t("resolveLateHelp")}</p><label>{t("reason")}<Textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label><Button type="button" disabled={!reason.trim() || resolve.isPending} onClick={() => resolve.mutate({ id, reason })}>{t("resolveLate")}</Button><TicketError error={resolve.error} /></section>}
			<h2>{t("individualTickets")}</h2><div className="ticket-grid">{detail.data?.tickets.map(ticket => <TicketCard root key={`${ticket.id}:${ticket.credentialVersion}`} ticket={ticket}><AdminTicketControls ticket={ticket} refresh={refresh} /></TicketCard>)}</div>
			{order.issue && <section className="ticket-panel"><h2>{t("recordResolution")}</h2><p>{t("resolutionHelp")}</p><label>{t("reason")}<Textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label><Button type="button" disabled={!reason.trim() || resolution.isPending} onClick={() => resolution.mutate({ id, reason })}>{t("recordResolution")}</Button><TicketError error={resolution.error} />{order.resolutionNote && <p>{order.resolutionNote} · {order.resolvedBy} · <EventTime value={order.resolvedAt!} timezone={order.snapshot.event.timezone} /></p>}</section>}
			<section className="ticket-panel"><h2>{t("refundManagement")}</h2><p className="ticket-warning">{t("refundHelp")}</p><form className="ticket-form-grid" onSubmit={e => { e.preventDefault(); refundKey.current ??= crypto.randomUUID(); refund.mutate({ orderId: id, requestKey: refundKey.current, status: refundStatus, amount, reason, reference }, { onSuccess: () => { refundKey.current = null; } }); }}><label>{t("refundStatus")}<select value={refundStatus} onChange={e => setRefundStatus(e.target.value as typeof refundStatus)}>{["pending", "completed", "failed"].map(status => <option key={status} value={status}>{t(`refund.${status}`)}</option>)}</select></label><label>{t("amountVnd")}<Input type="number" min={1} max={order.settledAmount} step={1} value={amount} onChange={e => setAmount(Number(e.target.value))} required /></label><label className="ticket-field-full">{t("reason")}<Textarea maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} required /></label><label>{t("reference")}<Input maxLength={200} value={reference} onChange={e => setReference(e.target.value)} /></label><Button type="submit" disabled={refund.isPending || !order.settledAmount}>{t("recordRefund")}</Button><TicketError error={refund.error} /></form>{detail.data?.refunds.map(item => <p key={item.id}>{t(`refund.${item.status}`)} · {item.amount} VND · {item.reason} · {item.reference} · <EventTime value={item.createdAt} timezone={order.snapshot.event.timezone} /></p>)}</section>
			<section className="ticket-panel"><h2>{t("emailDelivery")}</h2>{detail.data?.jobs.map(job => <p key={job.id}>{t(`emailStatus.${job.status}`)} · {t("attempts", { count: job.attempts })} · {job.toAddress}{job.lastError && <> · {t("issues.deliveryFailed")}</>}</p>)}</section>
			<details><summary>{t("paymentHistory")}</summary>{detail.data?.events.map(event => <p key={event.id}>{t.has(`eventKinds.${event.kind}`) ? t(`eventKinds.${event.kind}`) : t("eventOutcomes.other")} · {t.has(`eventOutcomes.${event.outcome}`) ? t(`eventOutcomes.${event.outcome}`) : t("eventOutcomes.other")} · {event.amount} {event.currency} · {event.reference} · <EventTime value={event.createdAt} timezone={order.snapshot.event.timezone} /></p>)}</details>
		</>}
	</>;
}
