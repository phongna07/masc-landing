"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@masc-landing/api/routers/index";
import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { SaveIcon } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { TicketError, TicketLoading } from "@/components/tickets/ticket-ui";

type Promo = inferRouterOutputs<AppRouter>["tickets"]["promos"][number];
type Prices = Promo["prices"];
const names = ["Silver", "Golden", "Platinum", "VIP"] as const;

function PromoForm({ promo, defaultPrices, refresh }: { promo?: Promo; defaultPrices: Prices; refresh: () => void }) {
	const t = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const [code, setCode] = useState(promo?.code ?? "");
	const [enabled, setEnabled] = useState(promo?.enabled ?? true);
	const [prices, setPrices] = useState(promo?.prices ?? defaultPrices);
	const [totalLimit, setTotalLimit] = useState<number | null>(promo?.totalLimit ?? null);
	const [perBuyerLimit, setPerBuyerLimit] = useState<number | null>(promo?.perBuyerLimit ?? null);
	const [priceError, setPriceError] = useState(false);
	const onSuccess = () => { notify.success(t("notifications.promoSaved")); refresh(); };
	const create = useMutation(trpc.tickets.createPromo.mutationOptions({ onSuccess, onError: notify.error }));
	const update = useMutation(trpc.tickets.updatePromo.mutationOptions({ onSuccess, onError: notify.error }));
	const pending = create.isPending || update.isPending;
	return <form onSubmit={event => {
		event.preventDefault();
		if (names.some(name => prices[name] !== 0 && prices[name] < 1000)) { setPriceError(true); return; }
		setPriceError(false);
		const input = { code, enabled, prices, totalLimit, perBuyerLimit };
		if (promo) update.mutate({ ...input, id: promo.id, revision: promo.revision });
		else create.mutate(input);
	}}>
		<fieldset className="min-w-0" disabled={pending}>
			<legend className={promo ? "ticket-section-label" : "sr-only"}>{t(promo ? "promo.edit" : "promo.create")}</legend>
			<div className="ticket-form-grid"><label>{t("promo.code")}<Input required maxLength={64} pattern={"[A-Za-z0-9_\\-]{1,64}"} value={code} onChange={event => setCode(event.target.value.toUpperCase())} autoComplete="off" /></label><label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />{t("promo.enabled")}</label></div>
			<div className="ticket-form-grid">{names.map(name => <label key={name}>{name} · VND<Input required type="number" min={0} max={1000000000} step={1} value={prices[name]} onChange={event => setPrices({ ...prices, [name]: Number(event.target.value) })} /></label>)}</div>
			<p>{t("promo.priceHelp")}</p>
			<div className="ticket-form-grid">{([
				["totalLimit", totalLimit, setTotalLimit], ["perBuyerLimit", perBuyerLimit, setPerBuyerLimit],
			] as const).map(([key, value, setValue]) => <div key={key}><label><input type="checkbox" checked={value === null} onChange={event => setValue(event.target.checked ? null : 1)} />{t(`promo.${key}Unlimited`)}</label><label>{t(`promo.${key}`)}<Input type="number" min={1} max={2147483647} step={1} required={value !== null} disabled={value === null} value={value ?? ""} placeholder={t("promo.unlimited")} onChange={event => setValue(Number(event.target.value))} /></label></div>)}</div>
			<p>{t("promo.limitHelp")}</p>
			{promo && <p>{t("promo.usage", { held: promo.held, consumed: promo.consumed })}</p>}
			<TicketError error={priceError ? { message: "promoPriceInvalid" } : create.error || update.error} />
			<Button className="ticket-button-success" type="submit" disabled={pending}><SaveIcon aria-hidden="true" />{t("promo.save")}</Button>
		</fieldset>
	</form>;
}

export default function PromoCodes({ defaultPrices, onSaved }: { defaultPrices: Prices; onSaved: () => void }) {
	const t = useTranslations("Tickets");
	const promos = useQuery(trpc.tickets.promos.queryOptions());
	const [generation, setGeneration] = useState(0);
	const refresh = () => { setGeneration(value => value + 1); void promos.refetch(); onSaved(); };
	return <section className="ticket-panel"><h2>{t("promo.management")}</h2><p>{t("promo.managementHelp")}</p>
		<details><summary>{t("promo.create")}</summary><PromoForm key={generation} defaultPrices={defaultPrices} refresh={refresh} /></details>
		<TicketError error={promos.error} />{promos.isPending && <TicketLoading />}
		{promos.data?.map(promo => <details key={promo.id}><summary>{promo.code} · {t(promo.enabled ? "promo.active" : "promo.inactive")}</summary><PromoForm key={`${promo.revision}:${promo.held}:${promo.consumed}`} promo={promo} defaultPrices={defaultPrices} refresh={refresh} /></details>)}
	</section>;
}
