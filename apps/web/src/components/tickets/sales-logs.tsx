"use client";

import type { inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "@masc-landing/api/routers/index";
import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@masc-landing/ui/components/dialog";
import { ConfirmationDialog } from "@masc-landing/ui/components/confirmation-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { TriangleAlertIcon } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";
import { trpc } from "@/utils/trpc";
import TicketCard, { TicketTime } from "./ticket-card";
import AdminTicketControls from "./admin-ticket-controls";
import SalesLogForm from "./sales-log-form";
import { Pagination, TicketEmpty, TicketError, TicketHeading, TicketLoading } from "./ticket-ui";
import { useTicketNotifications } from "./use-ticket-notifications";

type Filters = Omit<inferRouterInputs<AppRouter>["salesLogs"]["list"], "page">;
const defaults: Filters = { search: "", creator: "", category: "", from: "", to: "", proof: "", emailStatus: "", validity: "", checkIn: "", sort: "createdAt", direction: "desc", pageSize: 25 };
const sortKeys = ["createdAt", "buyer", "creator", "category", "quantity", "amountReceived", "emailStatus"] as const;

function SaleDetail({ id, isRoot, refresh }: { id: string; isRoot: boolean; refresh: () => void }) {
	const t = useTranslations("Tickets.sales");
	const ticketT = useTranslations("Tickets");
	const locale = useLocale();
	const notify = useTicketNotifications();
	const detail = useQuery(trpc.salesLogs.detail.queryOptions({ id }));
	const proof = useMutation(trpc.salesLogs.proof.mutationOptions({ onError: notify.error }));
	const sendKey = useRef<string | null>(null);
	const send = useMutation(trpc.salesLogs.sendEmail.mutationOptions({ onSuccess: log => {
		if (log.emailStatus === "sent") notify.success(t("emailSent")); else if (log.emailStatus === "failed") notify.warning(t("createdEmailFailed")); else notify.info(t("createdEmailPending"));
		sendKey.current = null;
		void detail.refetch(); refresh();
	}, onError: error => { notify.error(error); void detail.refetch(); } }));
	const reload = () => { void detail.refetch(); refresh(); };
	const data = detail.data;
	return <><TicketError error={detail.error} />{detail.isPending && <TicketLoading />}{data && <div className="sales-log-detail">
		<section className="ticket-panel sales-log-summary">
			<div className="sales-log-overview">
				<div>
					<h3>{t("columns.buyer")}</h3>
					<strong className="sales-log-primary">{data.log.buyerName}</strong>
					<p>{data.log.buyerEmail}<br />{data.log.buyerPhone}</p>
				</div>
				<div>
					<h3>{t("columns.category")}</h3>
					<strong className="sales-log-primary">{ticketT(`categories.${data.log.category}`)}</strong>
					<p>{t("quantity")}: {data.log.quantity}</p>
					<dl className="sales-log-amount"><dt>{t("amount")}</dt><dd>{new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(data.log.amountReceived)}</dd></dl>
				</div>
				<div>
					<h3>{t("creator")}</h3>
					<strong className="sales-log-primary">{data.log.creatorName}</strong>
					<p>{data.log.creatorEmail}</p>
					<p className="sales-log-time"><TicketTime value={data.log.createdAt} /></p>
				</div>
			</div>
			<p className="sales-log-note">{t("immutable")}</p>
		</section>
		<div className="sales-log-content">
			<div className="sales-log-tickets">{data.tickets.map(ticket => <TicketCard key={`${ticket.id}:${ticket.credentialVersion}:${ticket.validity}`} ticket={ticket} root={isRoot} showHistory={isRoot}>{isRoot && <AdminTicketControls ticket={ticket} refresh={reload} />}</TicketCard>)}</div>
			<div className="sales-log-sidebar">
				<section className="ticket-panel sales-log-delivery">
					<div className="sales-log-section-heading"><h3>{t("emailStatus")}</h3><span className={`ticket-badge${data.log.emailStatus === "sent" ? " ticket-badge-valid" : data.log.emailStatus === "failed" ? " ticket-badge-revoked" : ""}`}>{ticketT(`emailStatus.${data.log.emailStatus}`)}</span></div>
					{data.log.emailSentAt && <p className="sales-log-time"><TicketTime value={data.log.emailSentAt} /></p>}
					{(isRoot || data.log.canRetryEmail) && <p className="sales-log-note">{t("retryEmailHelp")}</p>}
					<div className="sales-log-actions">
						{(isRoot || data.log.canRetryEmail) && <ConfirmationDialog
							trigger={<Button type="button" disabled={send.isPending || (data.log.emailStatus === "sending" && !data.log.canRetryEmail)}>{t(data.log.emailStatus === "sent" ? "resend" : "retryEmail")}</Button>}
							title={t("sendTitle")} description={t("sendDescription", { email: data.log.buyerEmail })} confirmLabel={t("sendConfirm")} cancelLabel={t("cancel")}
							onConfirm={() => { sendKey.current ??= crypto.randomUUID(); send.mutate({ id, requestKey: sendKey.current }); }} />}
						<Button type="button" variant="outline" onClick={reload}>{ticketT("logs.refresh")}</Button>
					</div>
					<TicketError error={send.error} />
				</section>
				{data.log.hasProof && <section className="ticket-panel sales-log-proof-panel">
					<h3>{t("proof")}</h3><p className="sales-log-filename">{data.log.proofFilename}</p>
					<Button type="button" variant="outline" disabled={proof.isPending} onClick={() => proof.mutate({ id })}>{t("viewProof")}</Button>
					{proof.data && <a href={proof.data.url} target="_blank" rel="noreferrer"><img className="sales-log-proof" src={proof.data.url} alt={t("proofAlt")} /></a>}
				</section>}
			</div>
		</div>
		<div className="sales-log-histories">
			<section className="ticket-panel sales-log-history">
				<h3>{t("attempts")}</h3>
				{data.attempts.length === 0 ? <p>{t("noAttempts")}</p> : <ul className="sales-log-history-list">{data.attempts.map(attempt => <li key={attempt.id}>
					<strong>{ticketT(`emailStatus.${attempt.status}`)}</strong><TicketTime value={attempt.createdAt} />
					{attempt.error && <p>{t(attempt.error === "deliveryUncertain" ? "deliveryUncertain" : "deliveryFailed")}</p>}
				</li>)}</ul>}
			</section>
			<section className="ticket-panel sales-log-history">
				<h3>{ticketT("auditHistory")}</h3>
				<ul className="sales-log-history-list">{data.actions.map(action => <li key={action.id}>
					<strong>{ticketT.has(`audit.${action.action}`) ? ticketT(`audit.${action.action}`) : action.action}</strong>
					<TicketTime value={action.createdAt} /><span className="sales-log-actor">{action.actorId}</span>
				</li>)}</ul>
			</section>
		</div>
	</div>}</>;

}

export default function SalesLogs({ manage = false, isRoot = false, initialId }: { manage?: boolean; isRoot?: boolean; initialId?: string }) {
	const t = useTranslations("Tickets.sales");
	const ticketT = useTranslations("Tickets");
	const locale = useLocale();
	const [page, setPage] = useState(0);
	const [filters, setFilters] = useState(defaults);
	const [selected, setSelected] = useState<string | null>(z.uuid().safeParse(initialId).success ? initialId! : null);
	const invalidDate = !!(filters.from && filters.to && filters.from > filters.to);
	const invalidAmount = filters.minAmount !== undefined && filters.maxAmount !== undefined && filters.minAmount > filters.maxAmount;
	const logs = useQuery({ ...trpc.salesLogs.list.queryOptions({ ...filters, page }), enabled: !invalidDate && !invalidAmount });
	function update<K extends keyof Filters>(key: K, value: Filters[K]) { setFilters(current => ({ ...current, [key]: value })); setPage(0); }
	return <>
		<TicketHeading admin title={t(manage ? "manageTitle" : "title")} description={manage ? t("manageIntro") : undefined} />
		{!manage && <section className="sales-log-guidance" aria-labelledby="sales-log-guidance-title">
			<TriangleAlertIcon aria-hidden="true" />
			<div>
				<h2 id="sales-log-guidance-title">{t("guidance.title")}</h2>
				<p>{t("intro")}</p>
				<ol>
					<li>{t.rich("guidance.contacts", { strong: chunks => <strong>{chunks}</strong> })}</li>
					<li>{t("guidance.proof")}</li>
					<li>{t("guidance.submit")}</li>
				</ol>
				<p className="sales-log-guidance-result"><strong>{t("guidance.result")}</strong></p>
			</div>
		</section>}
		{!manage && <SalesLogForm onCreated={id => { setSelected(id); void logs.refetch(); }} />}
		<h2>{t(manage || isRoot ? "allHistory" : "ownHistory")}</h2>
		<div className="ticket-grid ticket-filters">
			<label>{ticketT("search")}<Input maxLength={100} value={filters.search} placeholder={t("searchPlaceholder")} onChange={e => update("search", e.target.value)} /></label>
			{isRoot && <label>{t("creator")}<Input maxLength={100} value={filters.creator} onChange={e => update("creator", e.target.value)} /></label>}
			<label>{ticketT("category")}<select value={filters.category} onChange={e => update("category", e.target.value as Filters["category"])}><option value="">{ticketT("all")}</option>{["normal", "vip"].map(key => <option key={key} value={key}>{ticketT(`categories.${key}`)}</option>)}</select></label>
			<label>{ticketT("logs.from")}<Input type="date" max={filters.to || "9999-12-31"} value={filters.from} onChange={e => update("from", e.target.value)} /></label>
			<label>{ticketT("logs.to")}<Input type="date" min={filters.from || undefined} max="9999-12-31" value={filters.to} onChange={e => update("to", e.target.value)} /></label>
			{(["minAmount", "maxAmount"] as const).map(key => <label key={key}>{t(key)}<Input type="number" min={0} max={2000000000} value={filters[key] ?? ""} onChange={e => update(key, e.target.value === "" ? undefined : Number(e.target.value))} /></label>)}
			<label>{t("proof")}<select value={filters.proof} onChange={e => update("proof", e.target.value as Filters["proof"])}><option value="">{ticketT("all")}</option><option value="yes">{t("hasProof")}</option><option value="no">{t("noProof")}</option></select></label>
			<label>{t("emailStatus")}<select value={filters.emailStatus} onChange={e => update("emailStatus", e.target.value as Filters["emailStatus"])}><option value="">{ticketT("all")}</option>{["pending", "sending", "sent", "failed"].map(key => <option key={key} value={key}>{ticketT(`emailStatus.${key}`)}</option>)}</select></label>
			<label>{ticketT("validityLabel")}<select value={filters.validity} onChange={e => update("validity", e.target.value as Filters["validity"])}><option value="">{ticketT("all")}</option>{["valid", "revoked"].map(key => <option key={key} value={key}>{ticketT(`validity.${key}`)}</option>)}</select></label>
			<label>{t("checkIn")}<select value={filters.checkIn} onChange={e => update("checkIn", e.target.value as Filters["checkIn"])}><option value="">{ticketT("all")}</option><option value="admitted">{t("admitted")}</option><option value="unused">{t("unused")}</option></select></label>
			<label>{ticketT("logs.sortBy")}<select value={filters.sort} onChange={e => update("sort", e.target.value as Filters["sort"])}>{sortKeys.map(key => <option key={key} value={key}>{t(`columns.${key}`)}</option>)}</select></label>
			<label>{ticketT("logs.direction")}<select value={filters.direction} onChange={e => update("direction", e.target.value as Filters["direction"])}><option value="desc">{ticketT("logs.desc")}</option><option value="asc">{ticketT("logs.asc")}</option></select></label>
			<label>{ticketT("logs.pageSize")}<select value={filters.pageSize} onChange={e => update("pageSize", Number(e.target.value) as Filters["pageSize"])}>{[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
		</div>
		<div className="ticket-toolbar"><Button type="button" variant="outline" onClick={() => { setFilters(defaults); setPage(0); }}>{ticketT("logs.reset")}</Button><Button type="button" variant="outline" disabled={logs.isFetching || invalidDate || invalidAmount} onClick={() => void logs.refetch()}>{ticketT("logs.refresh")}</Button><p>{ticketT("logs.timezone")}</p></div>
		<TicketError error={invalidDate ? { message: "invalidDateRange" } : invalidAmount ? { message: "invalidAmountRange" } : logs.error} />
		{!invalidDate && !invalidAmount && <>{logs.isPending && <TicketLoading />}{logs.data && <>{logs.data.total === 0 ? <TicketEmpty message={t("empty")} /> : <div className="ticket-scroll"><table className="admin-table ticket-table"><caption className="sr-only">{t("manageTitle")}</caption><thead><tr>{sortKeys.map(key => <th key={key} scope="col" aria-sort={filters.sort === key ? filters.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="sales-log-sort" onClick={() => { setFilters(current => ({ ...current, sort: key, direction: current.sort === key && current.direction === "asc" ? "desc" : "asc" })); setPage(0); }}>{t(`columns.${key}`)}{filters.sort === key ? filters.direction === "asc" ? " ↑" : " ↓" : " ↕"}</button></th>)}<th scope="col">{t("proof")}</th><th scope="col">{t("details")}</th></tr></thead><tbody>{logs.data.items.map(log => <tr key={log.id}>
			<td><TicketTime value={log.createdAt} /></td><td><strong>{log.buyerName}</strong><span>{log.buyerEmail}</span><span>{log.buyerPhone}</span></td><td><strong>{log.creatorName}</strong><span>{log.creatorEmail}</span></td><td>{ticketT(`categories.${log.category}`)}</td><td>{log.quantity}</td><td>{new Intl.NumberFormat(locale, { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(log.amountReceived)}</td><td>{ticketT(`emailStatus.${log.emailStatus}`)}</td><td>{t(log.hasProof ? "hasProof" : "noProof")}</td><td><Button type="button" variant="outline" size="sm" aria-label={t("detailsFor", { name: log.buyerName })} onClick={() => setSelected(log.id)}>{t("details")}</Button></td>
		</tr>)}</tbody></table></div>}<Pagination page={page} total={logs.data.total} pageSize={logs.data.pageSize} setPage={setPage} /></>}</>}
		<Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}>
			<DialogContent className="ticket-admin sales-log-dialog">
				<div className="sales-log-dialog-header">
					<DialogHeader><DialogTitle>{t("details")}</DialogTitle><DialogDescription className="sales-log-id">{selected}</DialogDescription></DialogHeader>
					<DialogClose render={<Button type="button" variant="outline" />}>{t("close")}</DialogClose>
				</div>
				{selected && <SaleDetail key={selected} id={selected} isRoot={isRoot} refresh={() => { void logs.refetch(); }} />}
			</DialogContent>
		</Dialog>
	</>;
}
