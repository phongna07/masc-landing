"use client";

import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { inferRouterOutputs } from "@trpc/server";
import { maxBundleQuantity, maxOrderAmount } from "@masc-landing/api/tickets/quantity";
import type { AppRouter } from "@masc-landing/api/routers/index";
import Link from "next/link";
import { TicketIcon, CreditCardIcon, CheckCircle2Icon, LoaderCircleIcon, TagIcon } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { TicketHeading, TicketLoading, TicketError } from "@/components/tickets/ticket-ui";

export default function PurchaseTickets({ initialReferralCode = "" }: { initialReferralCode?: string }) {
	const t = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const locale = useLocale();
	const router = useRouter();
	const config = useQuery(trpc.tickets.config.queryOptions());
	const [selected, setSelected] = useState<"Silver" | "Golden" | "Platinum" | "VIP">("Silver");
	const [quantity, setQuantity] = useState("1");
	const bundleQuantity = Number(quantity);
	const validQuantity = Number.isInteger(bundleQuantity) && bundleQuantity >= 1 && bundleQuantity <= maxBundleQuantity;
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const requestKey = useRef<string | null>(null);
	const [submitted, setSubmitted] = useState(false);
	const [promoCode, setPromoCode] = useState("");
	const [referralCode, setReferralCode] = useState(initialReferralCode);
	const [checkedPromo, setCheckedPromo] = useState<inferRouterOutputs<AppRouter>["tickets"]["checkPromo"] | null>(null);
	const [promoError, setPromoError] = useState<{ message: string } | null>(null);
	const promoGeneration = useRef(0);
	const check = useMutation(trpc.tickets.checkPromo.mutationOptions());
	const needsPromoCheck = Boolean(promoCode.trim()) && !checkedPromo;
	const selectedPackage = config.data?.packages.find(pack => pack.name === selected);
	const selectedPrice = checkedPromo?.prices[selected] ?? selectedPackage?.price;
	const totalPrice = selectedPrice === undefined ? undefined : selectedPrice * bundleQuantity;
	const stockExceeded = selected === "VIP" && bundleQuantity > (config.data?.vipAvailable ?? 0);
	const amountExceeded = totalPrice !== undefined && totalPrice > maxOrderAmount;
	const formatPrice = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
	function changeQuantity(value: string) {
		if (submitted) return;
		setQuantity(value);
		editPromo(promoCode);
	}
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
		if (!validQuantity) { setPromoError({ message: "bundleQuantityInvalid" }); return; }
		const generation = ++promoGeneration.current;
		setCheckedPromo(null);
		setPromoError(null);
		check.mutate({ code: promoCode.trim(), bundleQuantity }, {
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
			if (["promoChanged", "promoUnavailable", "promoLimitReached", "promoBuyerLimitReached", "salesClosed", "vipSoldOut", "vipReservationExists", "paymentNotConfigured", "orderAmountTooHigh", "bundleQuantityInvalid"].includes(error.message)) {
				setSubmitted(false);
				requestKey.current = null;
				if (error.message.startsWith("promo")) {
					promoGeneration.current++;
					setCheckedPromo(null);
					setPromoError(error);
				}
			}
			if (error.message === "vipSoldOut") void config.refetch();
			notify.error(error);
		},
	}));
	function choose(name: typeof selected) {
		if (submitted) return;
		if (name === selected) return;
		setSelected(name);
		changeQuantity("1");
	}
	return <><TicketHeading title={t("buy")} description={t("purchaseIntro")} action={<Button nativeButton={false} render={<Link href="/my-tickets" />} className="ticket-heading-action ticket-button-neutral" size="lg"><TicketIcon aria-hidden="true" />{t("myTickets")}</Button>} />
		{config.isPending && <TicketLoading />}<TicketError error={config.error} />
		{config.data && <><div className="ticket-sales-summary"><p className="ticket-warning">{t(config.data.isSalesOpened ? "salesOpen" : "salesClosed")}</p><p>{t("vipAvailability", { available: config.data.vipAvailable, limit: config.data.vipCapacity })}</p></div>
			<form onSubmit={event => { event.preventDefault(); if (checkout.isPending) return; if (!validQuantity) { notify.error({ message: "bundleQuantityInvalid" }); return; } if (stockExceeded) { notify.error({ message: "vipSoldOut" }); return; } if (amountExceeded) { notify.error({ message: "orderAmountTooHigh" }); return; } if (!/^[A-Za-z0-9_-]{0,64}$/.test(referralCode.trim())) { notify.error({ message: "referralCodeFormat" }); return; } if (needsPromoCheck || check.isPending) { notify.error({ message: "promoCheckRequired" }); return; } requestKey.current ??= crypto.randomUUID(); setSubmitted(true); checkout.mutate({ requestKey: requestKey.current, packageName: selected, bundleQuantity, buyerName: name.trim(), buyerPhone: phone.trim(), referralCode: referralCode.trim(), ...(checkedPromo ? { promo: { code: checkedPromo.code, revision: checkedPromo.revision } } : {}) }); }}>
				<fieldset disabled={checkout.isPending}><legend>{t("selectPackage")}</legend><div className="ticket-grid ticket-package-grid">{config.data.packages.map(pack => <label key={pack.name} className={`ticket-card ticket-package ${selected === pack.name ? "selected" : ""}`}><input type="radio" name="package" checked={selected === pack.name} onChange={() => choose(pack.name)} disabled={submitted || !config.data.isSalesOpened || (pack.name === "VIP" && !config.data.vipAvailable)} /><strong>{pack.name}</strong><p>{t("packageQuantity", { name: pack.name, count: pack.quantity })}</p>{pack.name === "VIP" && <p>{t("vipDescription")}</p>}<div className="ticket-package-pricing" data-promo={checkedPromo ? "" : undefined}>{checkedPromo && checkedPromo.prices[pack.name] !== pack.price && <p className="ticket-original-price"><span className="sr-only">{t("promo.originalPrice")}: </span><s>{new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(pack.price)}</s></p>}<p className="ticket-price">{checkedPromo && <span className="sr-only">{t("promo.promoPrice")}: </span>}{new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(checkedPromo?.prices[pack.name] ?? pack.price)}</p></div></label>)}</div></fieldset>
				<section className="ticket-panel ticket-bundle-panel" aria-labelledby="bundle-quantity-heading">
					<div className="ticket-bundle-controls">
						<h2 id="bundle-quantity-heading">{t("bundleQuantity")}</h2>
						<label>{t("bundleQuantityHelp", { name: selected, max: maxBundleQuantity })}<Input type="number" min={1} max={selected === "VIP" ? Math.min(maxBundleQuantity, config.data.vipAvailable) : maxBundleQuantity} step={1} required value={quantity} disabled={submitted || !config.data.isSalesOpened} onChange={event => changeQuantity(event.target.value)} aria-describedby="bundle-summary" /></label>
					</div>
					<div id="bundle-summary" className="ticket-bundle-summary" aria-live="polite" aria-atomic="true">
						<div className="ticket-bundle-details">
							{validQuantity && <p>{t("bundleSelection", { count: bundleQuantity, name: selected })} · {t("quantity", { count: (selectedPackage?.quantity ?? 0) * bundleQuantity })}</p>}
							<p>{t("bundleUnitPrice")}: {selectedPrice === undefined ? "—" : formatPrice(selectedPrice)}</p>
						</div>
						<div className="ticket-bundle-total"><p>{t("total")}</p><p className="ticket-price">{validQuantity && totalPrice !== undefined ? formatPrice(totalPrice) : "—"}</p></div>
						{(!validQuantity || stockExceeded || amountExceeded) && <div className="ticket-bundle-errors">
							{!validQuantity && <TicketError error={{ message: "bundleQuantityInvalid" }} />}
							{stockExceeded && <TicketError error={{ message: "vipSoldOut" }} />}
							{amountExceeded && <TicketError error={{ message: "orderAmountTooHigh" }} />}
						</div>}
					</div>
				</section>
				<div className="ticket-grid ticket-code-grid"><section className="ticket-panel" aria-labelledby="promo-heading"><h2 id="promo-heading">{t("promo.heading")}</h2>
					<div className="ticket-promo-form"><label>{t("promo.code")}<Input maxLength={64} autoComplete="off" value={promoCode} disabled={submitted} onChange={event => editPromo(event.target.value)} aria-describedby="promo-status" /></label><Button type="button" className="ticket-button-primary" disabled={submitted || check.isPending || !promoCode.trim() || !validQuantity} onClick={checkCode}>{check.isPending ? <LoaderCircleIcon className="motion-safe:animate-spin" aria-hidden="true" /> : <TagIcon aria-hidden="true" />}{t(check.isPending ? "promo.checking" : "promo.check")}</Button></div>
					<div id="promo-status" className={`ticket-promo-status${checkedPromo ? " is-applied" : ""}`} role="status" aria-atomic="true">{checkedPromo && <CheckCircle2Icon aria-hidden="true" />}<p>{checkedPromo ? t("promo.applied", { code: checkedPromo.code }) : t("promo.checkHelp")}</p></div><TicketError error={promoError} />
				</section>
				<section className="ticket-panel" aria-labelledby="referral-heading"><h2 id="referral-heading">{t("referral.heading")}</h2>
					<div className="ticket-referral-form"><label>{t("referral.code")}<Input maxLength={64} pattern={"[A-Za-z0-9_\\-]*"} title={t("referral.format")} autoComplete="off" value={referralCode} disabled={submitted} onChange={event => setReferralCode(event.target.value)} aria-describedby="referral-help" /></label></div>
					<p id="referral-help">{t("referral.help")}</p>
				</section></div>
				<div className="ticket-panel"><h2>{t("buyerContact")}</h2><p>{t("requiredContact")}</p><div className="ticket-form-grid"><label>{t("buyerName")}<Input required pattern=".*\S.*" title={t("buyerNameRequired")} autoComplete="name" maxLength={120} value={name} disabled={submitted} onChange={e => setName(e.target.value)} /></label><label>{t("buyerPhone")}<Input required pattern=".*\S.*" title={t("buyerPhoneRequired")} type="tel" autoComplete="tel" maxLength={40} value={phone} disabled={submitted} onChange={e => setPhone(e.target.value)} /></label></div></div>
				<TicketError error={checkout.error} /><div className="ticket-checkout-footer"><div>{selectedPrice === 0 ? <p>{t("promo.freeHelp")}</p> : <><p>{t("checkoutReservation", { minutes: 15 })}</p><p>{t("paymentQrNotice")}</p></>}</div>
				<Button className="ticket-button-primary" type="submit" disabled={checkout.isPending || !validQuantity || stockExceeded || amountExceeded || needsPromoCheck || check.isPending || !config.data.isSalesOpened || (selected === "VIP" && !config.data.vipAvailable)}><CreditCardIcon aria-hidden="true" />{t(checkout.isPending ? "creatingCheckout" : selectedPrice === 0 ? "promo.confirmFree" : "checkout")}</Button></div>
			</form></>}
	</>;
}
