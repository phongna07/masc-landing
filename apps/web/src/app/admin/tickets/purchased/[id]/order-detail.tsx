"use client";

import { ClipboardCheckIcon, RefreshCwIcon, SendIcon, ShieldCheckIcon } from "lucide-react";

import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { Button } from "@masc-landing/ui/components/button";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { trpc } from "@/utils/trpc";
import TicketCard, { TicketTime } from "@/components/tickets/ticket-card";
import AdminTicketControls from "@/components/tickets/admin-ticket-controls";
import { TicketHeading, TicketLoading, TicketError } from "@/components/tickets/ticket-ui";

export default function AdminOrderDetail({ id }: { id: string }) {
	const t = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const locale = useLocale();
	const detail = useQuery(trpc.tickets.orderDetail.queryOptions({ id }));
	const refresh = () => { void detail.refetch(); };
	const reconcile = useMutation(trpc.tickets.reconcile.mutationOptions({ onSuccess: () => { notify.info(t("notifications.reconciled")); refresh(); }, onError: notify.error }));
	const deliver = useMutation(trpc.tickets.deliver.mutationOptions({ onSuccess: () => { notify.info(t("notifications.confirmationQueued")); refresh(); }, onError: notify.error }));
	const resolve = useMutation(trpc.tickets.resolveLate.mutationOptions({ onSuccess: () => { notify.success(t("notifications.latePaymentResolved")); refresh(); }, onError: notify.error }));
	const resolution = useMutation(trpc.tickets.recordResolution.mutationOptions({ onSuccess: () => { notify.success(t("notifications.resolutionRecorded")); refresh(); }, onError: notify.error }));
	const [reason, setReason] = useState("");
	const order = detail.data?.order;
	return <><TicketHeading admin title={t("orderDetails")} description={t("orderDetailsIntro")} /><TicketError error={detail.error} />{detail.isPending && <TicketLoading />}{order && <><section className="ticket-panel"><h2>{order.providerOrderCode} · {order.snapshot.packageName}</h2><p>{order.id}</p>{order.snapshot.promo && <p>{t("promo.used", { code: order.snapshot.promo.code })}</p>}{order.referralCode && <p>{t("referral.used", { code: order.referralCode })}</p>}<p>{t("buyerContact")}: {order.buyerName || "—"} · {order.buyerPhone || "—"} · {order.buyerEmail}</p><p>{t(`payment.${order.paymentStatus}`)} · {t(`fulfillment.${order.fulfillmentStatus}`)}</p><p>{t("quantity", { count: order.snapshot.quantity })} · {t(`categories.${order.snapshot.category}`)}</p><p>{t("total")}: {new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(order.snapshot.totalPrice)}</p><p>{t("settledAmount")}: {order.settledAmount} VND</p>{order.issue && <p className="ticket-warning">{t.has(`issues.${order.issue}`) ? t(`issues.${order.issue}`) : t("issues.providerMismatch")}</p>}<p>{t("expires")}: <TicketTime value={order.expiresAt} /></p><div className="ticket-actions"><Button className="ticket-button-warning" type="button" disabled={reconcile.isPending || order.snapshot.totalPrice === 0} onClick={() => reconcile.mutate({ id })}><RefreshCwIcon aria-hidden="true" />{t("reconcile")}</Button><Button className="ticket-button-utility" type="button" disabled={order.fulfillmentStatus !== "issued" || deliver.isPending} onClick={() => deliver.mutate({ orderId: id, requestKey: crypto.randomUUID() })}><SendIcon aria-hidden="true" />{t("resendEmail")}</Button></div><TicketError error={reconcile.error || deliver.error} /></section>
			{order.issue === "latePayment" && order.fulfillmentStatus !== "issued" && <section className="ticket-panel"><h2>{t("resolveLate")}</h2><p>{t("resolveLateHelp")}</p><label>{t("reason")}<Textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label><Button className="ticket-button-warning" type="button" disabled={!reason.trim() || resolve.isPending} onClick={() => resolve.mutate({ id, reason })}><ShieldCheckIcon aria-hidden="true" />{t("resolveLate")}</Button><TicketError error={resolve.error} /></section>}
			<h2>{t("individualTickets")}</h2><div className="ticket-grid">{detail.data?.tickets.map(ticket => <TicketCard root key={`${ticket.id}:${ticket.credentialVersion}`} ticket={ticket}><AdminTicketControls ticket={ticket} refresh={refresh} /></TicketCard>)}</div>
			{order.issue && <section className="ticket-panel"><h2>{t("recordResolution")}</h2><p>{t("resolutionHelp")}</p><label>{t("reason")}<Textarea value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label><Button className="ticket-button-success" type="button" disabled={!reason.trim() || resolution.isPending} onClick={() => resolution.mutate({ id, reason })}><ClipboardCheckIcon aria-hidden="true" />{t("recordResolution")}</Button><TicketError error={resolution.error} />{order.resolutionNote && <p>{order.resolutionNote} · {order.resolvedBy} · <TicketTime value={order.resolvedAt!} /></p>}</section>}
			<section className="ticket-panel"><h2>{t("emailDelivery")}</h2>{detail.data?.jobs.map(job => <p key={job.id}>{t(`emailStatus.${job.status}`)} · {t("attempts", { count: job.attempts })} · {job.toAddress}{job.lastError && <> · {t("issues.deliveryFailed")}</>}</p>)}</section>
			<details><summary>{t("paymentHistory")}</summary>{detail.data?.events.map(event => <p key={event.id}>{t.has(`eventKinds.${event.kind}`) ? t(`eventKinds.${event.kind}`) : t("eventOutcomes.other")} · {t.has(`eventOutcomes.${event.outcome}`) ? t(`eventOutcomes.${event.outcome}`) : t("eventOutcomes.other")} · {event.amount} {event.currency} · {event.reference} · <TicketTime value={event.createdAt} /></p>)}</details>
		</>}
	</>;
}
