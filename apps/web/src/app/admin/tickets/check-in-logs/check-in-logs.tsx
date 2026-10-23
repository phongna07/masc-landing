"use client";

import type { inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "@masc-landing/api/routers/index";
import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon, RefreshCwIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { TicketTime } from "@/components/tickets/ticket-card";
import { Pagination, TicketEmpty, TicketError, TicketHeading, TicketLoading } from "@/components/tickets/ticket-ui";
import { trpc } from "@/utils/trpc";

type Filters = Required<Omit<inferRouterInputs<AppRouter>["tickets"]["checkInLogs"], "page">>;
const emptyFilters: Filters = { search: "", staff: "", source: "", category: "", outcome: "", admissionType: "", from: "", to: "", sort: "createdAt", direction: "desc", pageSize: 25 };
const sortColumns = ["createdAt", "source", "category", "recipient", "actor", "outcome"] as const;

export default function CheckInLogs() {
	const t = useTranslations("Tickets");
	const [page, setPage] = useState(0);
	const [filters, setFilters] = useState(emptyFilters);
	const invalidRange = Boolean(filters.from && filters.to && filters.from > filters.to);
	const logs = useQuery({ ...trpc.tickets.checkInLogs.queryOptions({ ...filters, page }), enabled: !invalidRange });
	function update<K extends keyof Filters>(key: K, value: Filters[K]) {
		setFilters(current => ({ ...current, [key]: value }));
		setPage(0);
	}
	function sortBy(sort: Filters["sort"]) {
		setFilters(current => ({ ...current, sort, direction: current.sort === sort && current.direction === "asc" ? "desc" : "asc" }));
		setPage(0);
	}
	return <>
		<TicketHeading admin title={t("checkInLogs")} description={t("logs.intro")} />
		<div className="ticket-grid ticket-filters">
			<label>{t("search")}<Input maxLength={100} value={filters.search} onChange={e => update("search", e.target.value)} placeholder={t("logs.searchPlaceholder")} /></label>
			<label>{t("logs.staff")}<Input maxLength={100} value={filters.staff} onChange={e => update("staff", e.target.value)} placeholder={t("logs.staffPlaceholder")} /></label>
			<label>{t("logs.columns.source")}<select value={filters.source} onChange={e => update("source", e.target.value as Filters["source"])}><option value="">{t("all")}</option>{["purchased", "gifted", "sales-log", "unknown"].map(key => <option key={key} value={key}>{t(`logs.sources.${key}`)}</option>)}</select></label>
			<label>{t("category")}<select value={filters.category} onChange={e => update("category", e.target.value as Filters["category"])}><option value="">{t("all")}</option>{["normal", "vip"].map(key => <option key={key} value={key}>{t(`categories.${key}`)}</option>)}</select></label>
			<label>{t("logs.columns.outcome")}<select value={filters.outcome} onChange={e => update("outcome", e.target.value as Filters["outcome"])}><option value="">{t("all")}</option>{["accepted", "rejected"].map(key => <option key={key} value={key}>{t(`outcomes.${key}`)}</option>)}</select></label>
			<label>{t("logs.admissionType")}<select value={filters.admissionType} onChange={e => update("admissionType", e.target.value as Filters["admissionType"])}><option value="">{t("all")}</option>{["standard", "override"].map(key => <option key={key} value={key}>{t(`logs.types.${key}`)}</option>)}</select></label>
			<label>{t("logs.from")}<Input type="date" max={filters.to || "9999-12-31"} value={filters.from} onChange={e => update("from", e.target.value)} /></label>
			<label>{t("logs.to")}<Input type="date" min={filters.from || undefined} max="9999-12-31" value={filters.to} onChange={e => update("to", e.target.value)} /></label>
			<label>{t("logs.sortBy")}<select value={filters.sort} onChange={e => update("sort", e.target.value as Filters["sort"])}>{sortColumns.map(key => <option key={key} value={key}>{t(`logs.columns.${key}`)}</option>)}</select></label>
			<label>{t("logs.direction")}<select value={filters.direction} onChange={e => update("direction", e.target.value as Filters["direction"])}><option value="desc">{t("logs.desc")}</option><option value="asc">{t("logs.asc")}</option></select></label>
			<label>{t("logs.pageSize")}<select value={filters.pageSize} onChange={e => update("pageSize", Number(e.target.value) as Filters["pageSize"])}>{[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
		</div>
		<div className="ticket-toolbar">
			<Button className="ticket-button-neutral" type="button" variant="outline" onClick={() => { setFilters(emptyFilters); setPage(0); }}><RotateCcwIcon aria-hidden="true" />{t("logs.reset")}</Button>
			<Button className="ticket-button-utility" type="button" variant="outline" disabled={logs.isFetching || invalidRange} aria-busy={logs.isFetching} onClick={() => void logs.refetch()}><RefreshCwIcon aria-hidden="true" />{t("logs.refresh")}</Button>
			<p>{t("logs.timezone")}</p>
		</div>
		<TicketError error={invalidRange ? { message: "invalidDateRange" } : logs.error} />
		{!invalidRange && logs.isPending && <TicketLoading />}
		{!invalidRange && logs.data && <>
			{logs.data.total === 0 ? <TicketEmpty message={t("logs.empty")} /> : <div className="ticket-scroll" aria-busy={logs.isFetching}>
				<table className="admin-table ticket-table ticket-check-in-logs-table">
					<caption className="sr-only">{t("checkInLogs")}</caption>
					<thead><tr>{(["createdAt", "ticket", "source", "category", "recipient", "actor", "outcome", "reason"] as const).map(key => {
						const sortable = sortColumns.find(column => column === key);
						const active = filters.sort === sortable;
						const Icon = active ? filters.direction === "asc" ? ArrowUpIcon : ArrowDownIcon : ArrowUpDownIcon;
						return <th scope="col" key={key} aria-sort={sortable ? active ? filters.direction === "asc" ? "ascending" : "descending" : "none" : undefined}>
							{sortable ? <Button className="ticket-log-sort" type="button" variant="ghost" size="sm" onClick={() => sortBy(sortable)}>{t(`logs.columns.${key}`)}<Icon aria-hidden="true" /></Button> : t(`logs.columns.${key}`)}
						</th>;
					})}</tr></thead>
					<tbody>{logs.data.items.map(event => <tr key={event.id}>
						<td><TicketTime value={event.createdAt} /></td>
						<td>{event.ordinal ? <strong>{t("logs.ticketNumber", { number: event.ordinal })}</strong> : <strong>{t("logs.sources.unknown")}</strong>}
							{event.orderId ? <Link className="admin-row-link" href={`/admin/tickets/purchased/${event.orderId}`}>{t("order")} · {event.orderCode}</Link> : event.batchId ? <Link className="admin-row-link" href={`/admin/tickets/gifted/${event.batchId}`}>{event.batchTitle}</Link> : null}
							{event.salesLogId && <Link className="admin-row-link" href={`/admin/tickets/manage-sales-log?id=${event.salesLogId}`}>{t("salesLog")} · {event.salesLogId}</Link>}
							{event.ticketId && <span>{event.ticketId}</span>}
						</td>
						<td>{t(`logs.sources.${event.source ?? "unknown"}`)}</td>
						<td>{event.category ? t(`categories.${event.category}`) : "—"}</td>
						<td><strong>{event.recipientName || "—"}</strong>{event.recipientEmail && <span>{event.recipientEmail}</span>}{event.recipientPhone && <span>{event.recipientPhone}</span>}</td>
						<td><strong>{event.actorName || event.actorId}</strong>{event.actorEmail && <span>{event.actorEmail}</span>}</td>
						<td><span className={`admin-badge ${event.outcome === "accepted" ? "is-success" : "is-danger"}`}>{t(`outcomes.${event.outcome}`)}</span>{event.isOverride && <span>{t("logs.types.override")}</span>}</td>
						<td>{!event.isOverride && t.has(`scan.${event.reason}`) ? t(`scan.${event.reason}`) : event.reason}</td>
					</tr>)}</tbody>
				</table>
			</div>}
			<Pagination page={page} total={logs.data.total} pageSize={logs.data.pageSize} setPage={setPage} />
		</>}
	</>;
}
