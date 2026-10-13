"use client";

import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TicketIcon, CreditCardIcon } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { TicketHeading, TicketLoading, TicketError } from "@/components/tickets/ticket-ui";

export default function PurchaseTickets() {
	const t = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const locale = useLocale();
	const router = useRouter();
	const config = useQuery(trpc.tickets.config.queryOptions());
	const [selected, setSelected] = useState<"Silver" | "Golden" | "Platinum" | "VIP">("Silver");
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const requestKey = useRef<string | null>(null);
	const submitted = useRef(false);
	const checkout = useMutation(trpc.tickets.checkout.mutationOptions({
		onSuccess: order => {
			if (order.checkoutUrl && !order.checkoutClosedAt && order.fulfillmentStatus !== "issued" && (["pending", "processing"].includes(order.paymentStatus) || order.issue === "underpaid") && new Date(order.expiresAt).getTime() > Date.now()) {
				window.location.assign(order.checkoutUrl);
				return;
			}
			notify.info(t("notifications.orderCreated"));
			router.push(`/tickets/orders/${order.id}`);
		},
		onError: notify.error,
	}));
	function choose(name: typeof selected) {
		if (submitted.current) return;
		setSelected(name);
	}
	return <><TicketHeading title={t("buy")} description={t("purchaseIntro")} action={<Button nativeButton={false} render={<Link href="/my-tickets" />} className="ticket-heading-action ticket-button-neutral" size="lg"><TicketIcon aria-hidden="true" />{t("myTickets")}</Button>} />
		{config.isPending && <TicketLoading />}<TicketError error={config.error} />
		{config.data && <><div className="ticket-sales-summary"><p className="ticket-warning">{t(config.data.isSalesOpened ? "salesOpen" : "salesClosed")}</p><p>{t("vipAvailability", { available: config.data.vipAvailable, limit: config.data.vipCapacity })}</p></div>
			<form onSubmit={event => { event.preventDefault(); requestKey.current ??= crypto.randomUUID(); submitted.current = true; checkout.mutate({ requestKey: requestKey.current, packageName: selected, buyerName: name.trim(), buyerPhone: phone.trim() }); }}>
				<fieldset disabled={checkout.isPending}><legend>{t("selectPackage")}</legend><div className="ticket-grid ticket-package-grid">{config.data.packages.map(pack => <label key={pack.name} className={`ticket-card ticket-package ${selected === pack.name ? "selected" : ""}`}><input type="radio" name="package" checked={selected === pack.name} onChange={() => choose(pack.name)} disabled={submitted.current || !config.data.isSalesOpened || (pack.name === "VIP" && !config.data.vipAvailable)} /><strong>{pack.name}</strong><p>{t("packageQuantity", { name: pack.name, count: pack.quantity })}</p>{pack.name === "VIP" && <p>{t("vipDescription")}</p>}<p className="ticket-price">{new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(pack.price)}</p></label>)}</div></fieldset>
				<div className="ticket-panel"><h2>{t("buyerContact")}</h2><p>{t("requiredContact")}</p><div className="ticket-form-grid"><label>{t("buyerName")}<Input required pattern=".*\S.*" title={t("buyerNameRequired")} autoComplete="name" maxLength={120} value={name} disabled={submitted.current} onChange={e => setName(e.target.value)} /></label><label>{t("buyerPhone")}<Input required pattern=".*\S.*" title={t("buyerPhoneRequired")} type="tel" autoComplete="tel" maxLength={40} value={phone} disabled={submitted.current} onChange={e => setPhone(e.target.value)} /></label></div></div>
				<TicketError error={checkout.error} /><div className="ticket-checkout-footer"><div><p>{t("checkoutReservation", { minutes: 15 })}</p><p>{t("paymentQrNotice")}</p></div>
				<Button className="ticket-button-primary" type="submit" disabled={checkout.isPending || !config.data.isSalesOpened || (selected === "VIP" && !config.data.vipAvailable)}><CreditCardIcon aria-hidden="true" />{t(checkout.isPending ? "creatingCheckout" : "checkout")}</Button></div>
			</form></>}
	</>;
}
