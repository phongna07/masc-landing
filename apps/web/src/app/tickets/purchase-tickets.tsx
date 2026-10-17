"use client";

import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@masc-landing/api/routers/index";
import Link from "next/link";
import { TicketIcon, CreditCardIcon, CheckCircle2Icon, LoaderCircleIcon, TagIcon } from "lucide-react";
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
	const [submitted, setSubmitted] = useState(false);
	const [promoCode, setPromoCode] = useState("");
	const [checkedPromo, setCheckedPromo] = useState<inferRouterOutputs<AppRouter>["tickets"]["checkPromo"] | null>(null);
	const [promoError, setPromoError] = useState<{ message: string } | null>(null);
	const promoGeneration = useRef(0);
	const check = useMutation(trpc.tickets.checkPromo.mutationOptions());
	const needsPromoCheck = Boolean(promoCode.trim()) && !checkedPromo;
	const selectedPrice = checkedPromo?.prices[selected] ?? config.data?.packages.find(pack => pack.name === selected)?.price;
	function editPromo(value: string) {
		promoGeneration.current++;
		setPromoCode(value);
		setCheckedPromo(null);
		setPromoError(null);
		checkout.reset();
		check.reset();
	}
	function checkCode() {
		if (!/^[A-Za-z0-9_-]{1,64}$/.test(promoCode.trim())) { setPromoError({ message: "promoCodeFormat" }); return; }
		const generation = ++promoGeneration.current;
		setCheckedPromo(null);
		setPromoError(null);
		check.mutate({ code: promoCode.trim() }, {
			onSuccess: result => {
				if (generation !== promoGeneration.current) return;
				setCheckedPromo(result);
				setPromoCode(result.code);
				checkout.reset();
			},
			onError: error => { if (generation === promoGeneration.current) setPromoError(error); },
		});
	}
	const checkout = useMutation(trpc.tickets.checkout.mutationOptions({
		onSuccess: order => {
			if (order.checkoutUrl && !order.checkoutClosedAt && order.fulfillmentStatus !== "issued" && (["pending", "processing"].includes(order.paymentStatus) || order.issue === "underpaid") && new Date(order.expiresAt).getTime() > Date.now()) {
				window.location.assign(order.checkoutUrl);
				return;
			}
			notify.info(t("notifications.orderCreated"));
			router.push(`/tickets/orders/${order.id}`);
		},
		onError: error => {
			if (["promoChanged", "promoUnavailable", "promoLimitReached", "promoBuyerLimitReached", "salesClosed", "vipSoldOut", "vipReservationExists", "paymentNotConfigured"].includes(error.message)) {
				setSubmitted(false);
				requestKey.current = null;
				if (error.message.startsWith("promo")) {
					promoGeneration.current++;
					setCheckedPromo(null);
					setPromoError(error);
				}
			}
			notify.error(error);
		},
	}));
	function choose(name: typeof selected) {
		if (submitted) return;
		setSelected(name);
	}
	return <><TicketHeading title={t("buy")} description={t("purchaseIntro")} action={<Button nativeButton={false} render={<Link href="/my-tickets" />} className="ticket-heading-action ticket-button-neutral" size="lg"><TicketIcon aria-hidden="true" />{t("myTickets")}</Button>} />
		{config.isPending && <TicketLoading />}<TicketError error={config.error} />
		{config.data && <><div className="ticket-sales-summary"><p className="ticket-warning">{t(config.data.isSalesOpened ? "salesOpen" : "salesClosed")}</p><p>{t("vipAvailability", { available: config.data.vipAvailable, limit: config.data.vipCapacity })}</p></div>
			<form onSubmit={event => { event.preventDefault(); if (checkout.isPending) return; if (needsPromoCheck || check.isPending) { notify.error({ message: "promoCheckRequired" }); return; } requestKey.current ??= crypto.randomUUID(); setSubmitted(true); checkout.mutate({ requestKey: requestKey.current, packageName: selected, buyerName: name.trim(), buyerPhone: phone.trim(), ...(checkedPromo ? { promo: { code: checkedPromo.code, revision: checkedPromo.revision } } : {}) }); }}>
				<fieldset disabled={checkout.isPending}><legend>{t("selectPackage")}</legend><div className="ticket-grid ticket-package-grid">{config.data.packages.map(pack => <label key={pack.name} className={`ticket-card ticket-package ${selected === pack.name ? "selected" : ""}`}><input type="radio" name="package" checked={selected === pack.name} onChange={() => choose(pack.name)} disabled={submitted || !config.data.isSalesOpened || (pack.name === "VIP" && !config.data.vipAvailable)} /><strong>{pack.name}</strong><p>{t("packageQuantity", { name: pack.name, count: pack.quantity })}</p>{pack.name === "VIP" && <p>{t("vipDescription")}</p>}<div className="ticket-package-pricing" data-promo={checkedPromo ? "" : undefined}>{checkedPromo && checkedPromo.prices[pack.name] !== pack.price && <p className="ticket-original-price"><span className="sr-only">{t("promo.originalPrice")}: </span><s>{new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(pack.price)}</s></p>}<p className="ticket-price">{checkedPromo && <span className="sr-only">{t("promo.promoPrice")}: </span>}{new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(checkedPromo?.prices[pack.name] ?? pack.price)}</p></div></label>)}</div></fieldset>
				<section className="ticket-panel" aria-labelledby="promo-heading"><h2 id="promo-heading">{t("promo.heading")}</h2>
					<div className="ticket-promo-form"><label>{t("promo.code")}<Input maxLength={64} autoComplete="off" value={promoCode} disabled={submitted} onChange={event => editPromo(event.target.value)} aria-describedby="promo-status" /></label><Button type="button" className="ticket-button-primary" disabled={submitted || check.isPending || !promoCode.trim()} onClick={checkCode}>{check.isPending ? <LoaderCircleIcon className="motion-safe:animate-spin" aria-hidden="true" /> : <TagIcon aria-hidden="true" />}{t(check.isPending ? "promo.checking" : "promo.check")}</Button></div>
					<div id="promo-status" className={`ticket-promo-status${checkedPromo ? " is-applied" : ""}`} role="status" aria-atomic="true">{checkedPromo && <CheckCircle2Icon aria-hidden="true" />}<p>{checkedPromo ? t("promo.applied", { code: checkedPromo.code }) : t("promo.checkHelp")}</p></div><TicketError error={promoError} />
				</section>
				<div className="ticket-panel"><h2>{t("buyerContact")}</h2><p>{t("requiredContact")}</p><div className="ticket-form-grid"><label>{t("buyerName")}<Input required pattern=".*\S.*" title={t("buyerNameRequired")} autoComplete="name" maxLength={120} value={name} disabled={submitted} onChange={e => setName(e.target.value)} /></label><label>{t("buyerPhone")}<Input required pattern=".*\S.*" title={t("buyerPhoneRequired")} type="tel" autoComplete="tel" maxLength={40} value={phone} disabled={submitted} onChange={e => setPhone(e.target.value)} /></label></div></div>
				<TicketError error={checkout.error} /><div className="ticket-checkout-footer"><div>{selectedPrice === 0 ? <p>{t("promo.freeHelp")}</p> : <><p>{t("checkoutReservation", { minutes: 15 })}</p><p>{t("paymentQrNotice")}</p></>}</div>
				<Button className="ticket-button-primary" type="submit" disabled={checkout.isPending || needsPromoCheck || check.isPending || !config.data.isSalesOpened || (selected === "VIP" && !config.data.vipAvailable)}><CreditCardIcon aria-hidden="true" />{t(checkout.isPending ? "creatingCheckout" : selectedPrice === 0 ? "promo.confirmFree" : "checkout")}</Button></div>
			</form></>}
	</>;
}
