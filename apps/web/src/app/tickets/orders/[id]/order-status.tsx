"use client";

import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { Button } from "@masc-landing/ui/components/button";
import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { trpc } from "@/utils/trpc";
import TicketCard, { EventTime } from "@/components/tickets/ticket-card";
import { TicketHeading, TicketLoading, TicketError } from "@/components/tickets/ticket-ui";

export default function OrderStatus({ id }: { id: string }) {
	const t = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const locale = useLocale();
	const order = useQuery({ ...trpc.tickets.order.queryOptions({ id }), refetchInterval: query => ["creating", "pending", "processing"].includes(query.state.data?.order.paymentStatus ?? "") ? 5000 : false });
	const verify = useMutation(trpc.tickets.verifyOrder.mutationOptions({ onSuccess: () => { void order.refetch(); } }));
	const cancel = useMutation(trpc.tickets.cancel.mutationOptions({
		onSuccess: async () => {
			const current = await order.refetch();
			if (current.error) { notify.error(current.error); return; }
			if (current.data?.order.paymentStatus === "cancelled") notify.success(t("notifications.cancelled"));
			else notify.info(t("notifications.cancellationChecked"));
		},
		onError: notify.error,
	}));
	const paymentStatus = order.data?.order.paymentStatus;
	const verifyPayment = verify.mutate;
	useEffect(() => {
		verifyPayment({ id });
		const interval = window.setInterval(() => { if (["creating", "pending", "processing"].includes(paymentStatus ?? "")) verifyPayment({ id }); }, 15000);
		return () => window.clearInterval(interval);
	}, [id, paymentStatus, verifyPayment]);
	const value = order.data?.order;
	return <><TicketHeading title={t("orderStatus")} description={t("statusIntro")} action={<Button nativeButton={false} render={<Link href="/my-tickets" />} variant="outline">{t("myTickets")}</Button>} /><TicketError error={order.error} />{order.isPending && <TicketLoading />}
		{value && <><section className="ticket-panel" aria-live="polite"><h2>{t(`payment.${value.paymentStatus}`)}</h2><p>{t("fulfillmentLabel")}: {t(`fulfillment.${value.fulfillmentStatus}`)}</p>
			<p>{value.snapshot.packageName} · {t("quantity", { count: value.snapshot.quantity })} · {new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value.snapshot.totalPrice)}</p>
			{["creating", "pending", "processing"].includes(value.paymentStatus) && <p role="status">{t("confirming")}</p>}
			{value.issue && <p className="ticket-warning">{t.has(`issues.${value.issue}`) ? t(`issues.${value.issue}`) : t("issues.providerMismatch")}</p>}
			<p>{t("expires")}: <EventTime value={value.expiresAt} timezone={value.snapshot.event.timezone} /></p>
			<div className="ticket-actions">{value.checkoutUrl && !value.checkoutClosedAt && (["pending", "processing"].includes(value.paymentStatus) || value.issue === "underpaid") && new Date(value.expiresAt).getTime() > Date.now() && <Button nativeButton={false} render={<a href={value.checkoutUrl} rel="noreferrer" />}>{t("continuePayment")}</Button>}
			{!value.checkoutClosedAt && (["creating", "pending", "processing"].includes(value.paymentStatus) || value.issue === "underpaid") && <Button type="button" variant="outline" disabled={cancel.isPending || verify.isPending} onClick={() => cancel.mutate({ id })}>{t("cancelCheckout")}</Button>}
			<Button type="button" disabled={verify.isPending} onClick={() => verify.mutate({ id }, { onSuccess: () => notify.info(t("notifications.statusChecked")), onError: notify.error })}>{t("refreshStatus")}</Button></div><TicketError error={verify.error || cancel.error} />
			<p>{t("backgroundFulfillment")}</p></section><div className="ticket-grid">{order.data?.tickets.map(ticket => <TicketCard key={ticket.id} ticket={ticket} />)}</div></>}
	</>;
}
