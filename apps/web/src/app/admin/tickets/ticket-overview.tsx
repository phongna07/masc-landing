"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@masc-landing/api/routers/index";
import { trpc } from "@/utils/trpc";
import { TicketHeading, TicketLoading, TicketEmpty, TicketError } from "@/components/tickets/ticket-ui";
import { EventTime } from "@/components/tickets/ticket-card";
import { AdminMetrics } from "@/app/admin/admin-state";

type Config = inferRouterOutputs<AppRouter>["tickets"]["adminConfig"];
function SettingsForm({ config, refresh }: { config: Config; refresh: () => void }) {
	const t = useTranslations("Tickets");
	const [sales, setSales] = useState(config.isSalesOpened);
	const [capacity, setCapacity] = useState(config.vipCapacity);
	const [event, setEvent] = useState(config.event);
	const [prices, setPrices] = useState(Object.fromEntries(config.packages.map(p => [p.name, p.price])) as Record<"Silver" | "Golden" | "Platinum" | "VIP", number>);
	const [saved, setSaved] = useState(false);
	const save = useMutation(trpc.tickets.settings.mutationOptions({ onSuccess: () => { setSaved(true); refresh(); } }));
	return <form className="ticket-panel" onSubmit={e => { e.preventDefault(); setSaved(false); save.mutate({ isSalesOpened: sales, vipCapacity: capacity, event, prices }); }}>
		<h2>{t("settings")}</h2><label><input type="checkbox" checked={sales} onChange={e => setSales(e.target.checked)} />{t("salesToggle")}</label>
		<p>{t("salesToggleHelp")}</p><label>{t("vipCapacity")}<Input type="number" min={config.vipUsed} max={100000} required value={capacity} onChange={e => setCapacity(Number(e.target.value))} /></label>
		<p>{t("vipAvailability", { available: config.vipAvailable, limit: config.vipCapacity })}</p><p>{t("capacityHelp")}</p>
		<div className="ticket-grid">{config.packages.map(pack => <label key={pack.name}>{pack.name} · VND<Input type="number" min={1000} max={1000000000} step={1} value={prices[pack.name]} onChange={e => setPrices({ ...prices, [pack.name]: Number(e.target.value) })} required /></label>)}</div><p>{t("priceSnapshotHelp")}</p>
		<h2>{t("eventMetadata")}</h2><div className="ticket-form-grid"><label className="ticket-field-full">{t("eventName")}<Input maxLength={120} value={event.name} onChange={e => setEvent({ ...event, name: e.target.value })} required /></label>
		<label className="ticket-field-full">{t("eventDate")}<Input type="text" placeholder={t("datePlaceholder")} value={event.date ?? ""} onChange={e => setEvent({ ...event, date: e.target.value || null })} /></label><p className="ticket-field-full">{t("dateHelp")}</p>
		<label>{t("venue")}<Input maxLength={160} value={event.venue ?? ""} onChange={e => setEvent({ ...event, venue: e.target.value || null })} /></label><label>{t("timezone")}<Input value={event.timezone} onChange={e => setEvent({ ...event, timezone: e.target.value })} required /></label>
		</div><TicketError error={save.error} />{saved && <p role="status">{t("saved")}</p>}<Button type="submit" disabled={save.isPending}>{t("saveSettings")}</Button>
	</form>;
}

export default function TicketOverview() {
	const t = useTranslations("Tickets");
	const locale = useLocale();
	const config = useQuery(trpc.tickets.adminConfig.queryOptions());
	const stats = useQuery(trpc.tickets.stats.queryOptions());
	const alerts = useQuery(trpc.tickets.alerts.queryOptions());
	const [page, setPage] = useState(0);
	const activity = useQuery(trpc.tickets.activity.queryOptions({ page }));
	const reconcile = useMutation(trpc.tickets.reconcile.mutationOptions({ onSuccess: () => { void alerts.refetch(); void stats.refetch(); } }));
	const confirm = useMutation(trpc.tickets.confirmWebhook.mutationOptions());
	const staff = useMutation(trpc.tickets.setEntranceStaff.mutationOptions());
	const [staffEmail, setStaffEmail] = useState("");
	return <><TicketHeading admin title={t("ticketManagement")} description={t("overviewIntro")} /><TicketError error={config.error || stats.error || alerts.error} />
		<AdminMetrics label={t("statistics")} metrics={(["purchased", "gifted", "revoked", "accepted"] as const).map(key => ({ label: t(`stats.${key}`), value: stats.data?.[key] }))} isPending={stats.isPending} isError={stats.isError} errorLabel={t("errors.operationFailed")} retry={() => void stats.refetch()} retryLabel={t("retry")} locale={locale} />
		{config.isPending && <TicketLoading />}
		{config.data && <SettingsForm key={config.data.updatedAt} config={config.data} refresh={() => { void config.refetch(); }} />}
		<section className="ticket-panel"><h2>{t("entranceStaff")}</h2><p>{t("entranceStaffHelp")}</p><form onSubmit={e => { e.preventDefault(); staff.mutate({ email: staffEmail, enabled: true }); }}><label>{t("staffEmail")}<Input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} required /></label><div className="ticket-actions"><Button type="submit" disabled={staff.isPending}>{t("grantStaff")}</Button><Button type="button" variant="destructive" disabled={staff.isPending || !staffEmail} onClick={() => staff.mutate({ email: staffEmail, enabled: false })}>{t("removeStaff")}</Button></div><TicketError error={staff.error} />{staff.isSuccess && <p role="status">{t("saved")}</p>}</form></section>
		<div className="ticket-panel"><h2>{t("recovery")}</h2><p>{t("recoveryHelp")}</p><div className="ticket-actions"><Button type="button" disabled={reconcile.isPending} onClick={() => reconcile.mutate({})}>{t("reconcile")}</Button><Button type="button" disabled={confirm.isPending} onClick={() => confirm.mutate()}>{t("confirmWebhook")}</Button></div><TicketError error={reconcile.error || confirm.error} />{confirm.isSuccess && <p role="status">{t("webhookConfirmed")}</p>}{reconcile.isSuccess && <p role="status">{t("reconciled")}</p>}</div>
		<h2>{t("paymentAlerts")}</h2>{alerts.data?.length === 0 && <TicketEmpty message={t("noAlerts")} />}{alerts.data?.map(alert => <div className="ticket-panel ticket-danger" key={alert.id}><p>{alert.providerOrderCode} · {alert.paymentLinkId}</p><p>{alert.amount} {alert.currency} · {t(`alert.${alert.outcome}`)}</p><p>{alert.reference}</p></div>)}
		<details><summary>{t("auditHistory")}</summary><TicketError error={activity.error} />{activity.data?.map(action => <p key={action.id}>{t.has(`audit.${action.action}`) ? t(`audit.${action.action}`) : action.action} · {action.actorId} · {action.reason} · <EventTime value={action.createdAt} timezone={config.data?.event.timezone ?? "Asia/Ho_Chi_Minh"} /></p>)}<div className="ticket-actions"><Button type="button" disabled={!page} onClick={() => setPage(page - 1)}>{t("previous")}</Button><Button type="button" disabled={(activity.data?.length ?? 0) < 30} onClick={() => setPage(page + 1)}>{t("next")}</Button></div></details>
	</>;
}
