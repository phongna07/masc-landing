"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheetIcon, RefreshCwIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TicketEmpty, TicketError, TicketHeading, TicketLoading } from "@/components/tickets/ticket-ui";
import { trpc } from "@/utils/trpc";
import { columnGroups, entranceRows, entranceSearchIndex, exportEntranceExcel, matchesEntranceSearch } from "./entrance-info-data";

export default function EntranceInfo() {
	const t = useTranslations("EntranceInfo");
	const locale = useLocale();
	const [search, setSearch] = useState("");
	const [isExporting, setIsExporting] = useState(false);
	const tickets = useQuery({ ...trpc.tickets.entranceInfo.queryOptions(), staleTime: 0, refetchOnMount: "always" });
	const rows = useMemo(() => entranceRows(tickets.data ?? [], t, locale), [tickets.data, t, locale]);
	const indexed = useMemo(() => rows.map(row => ({ row, index: entranceSearchIndex(row) })), [rows]);
	const matching = useMemo(() => indexed.filter(item => matchesEntranceSearch(item.index, search)), [indexed, search]);

	async function exportExcel() {
		setIsExporting(true);
		try {
			await exportEntranceExcel(rows, t);
			toast.success(t("exportSuccess", { count: rows.length }), { position: "bottom-right" });
		} catch {
			toast.error(t("exportError"), { position: "bottom-right" });
		} finally {
			setIsExporting(false);
		}
	}

	return <>
		<TicketHeading admin title={t("title")} description={t("description")} />
		<div className="ticket-panel">
			<label htmlFor="entrance-search">{t("search")}<Input id="entrance-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("searchPlaceholder")} /></label>
			<div className="ticket-toolbar">
				<Button type="button" variant="outline" className="ticket-button-utility" disabled={tickets.isFetching} aria-busy={tickets.isFetching} onClick={() => void tickets.refetch()}><RefreshCwIcon aria-hidden="true" />{t("refresh")}</Button>
				<Button type="button" variant="outline" className="ticket-button-utility" disabled={!tickets.data || tickets.isFetching || tickets.isError || isExporting} aria-busy={isExporting} onClick={() => void exportExcel()}><FileSpreadsheetIcon aria-hidden="true" />{t(isExporting ? "exporting" : "exportExcel")}</Button>
				<p>{t("exportHelp")}</p>
			</div>
		</div>
		<TicketError error={tickets.error} />
		{tickets.isPending && <TicketLoading />}
		{tickets.data && <>
			<p role="status">{t("counts", { matching: matching.length, total: rows.length })}</p>
			{rows.length === 0 ? <TicketEmpty message={t("empty")} /> : matching.length === 0 ? <TicketEmpty message={t("noMatches")} /> : <div className="ticket-scroll" aria-busy={tickets.isFetching}>
				<table className="admin-table ticket-table entrance-info-table">
					<caption className="sr-only">{t("title")}</caption>
					<thead><tr>{Object.keys(columnGroups).map(group => <th scope="col" key={group}>{t(`groups.${group}`)}</th>)}</tr></thead>
					<tbody>{matching.map(({ row }) => <tr key={row.id}>{Object.entries(columnGroups).map(([group, keys]) => <td key={group}>{keys.map(key => {
						const value = row.values[key];
						if (value == null || value === "") return null;
						return <span className="entrance-info-field" key={key}><small>{t(`columns.${key}`)}: </small>{key === "validity" ? <strong className={`admin-badge ${value === t("validities.valid") ? "is-success" : "is-danger"}`}>{value}</strong> : value}</span>;
					})}</td>)}</tr>)}</tbody>
				</table>
			</div>}
		</>}
	</>;
}
