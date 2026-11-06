"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@masc-landing/ui/components/accordion";
import { Button } from "@masc-landing/ui/components/button";
import { trpc } from "@/utils/trpc";
import { TicketTime } from "@/components/tickets/ticket-card";
import { Pagination, TicketEmpty, TicketError, TicketLoading } from "@/components/tickets/ticket-ui";

export default function RecentCheckIns() {
	const t = useTranslations("Tickets");
	const [open, setOpen] = useState(false);
	const [page, setPage] = useState(0);
	const checkIns = useQuery({ ...trpc.tickets.recentCheckIns.queryOptions({ page }), enabled: open });

	return <Accordion value={open ? ["recent"] : []} onValueChange={value => setOpen(value.includes("recent"))}>
		<AccordionItem value="recent" className="ticket-panel ticket-recent-check-ins">
			<AccordionHeader render={<h2 />}>
				<AccordionTrigger className="ticket-recent-check-ins-trigger">{t("recentCheckIns.title")}<ChevronDownIcon aria-hidden="true" /></AccordionTrigger>
			</AccordionHeader>
			<AccordionPanel>
				{open && <>
					<div className="ticket-toolbar">
						<p>{t("recentCheckIns.description")}</p>
						<Button className="ticket-button-utility" type="button" variant="outline" disabled={checkIns.isFetching} aria-busy={checkIns.isFetching} onClick={() => void checkIns.refetch()}><RefreshCwIcon aria-hidden="true" />{t("logs.refresh")}</Button>
					</div>
					<TicketError error={checkIns.error} />
					{checkIns.isPending && <TicketLoading />}
					{checkIns.data && <>
						{checkIns.data.total === 0 ? <TicketEmpty message={t("recentCheckIns.empty")} /> : <div className="ticket-scroll" aria-busy={checkIns.isFetching}>
							<table className="admin-table ticket-table">
								<caption className="sr-only">{t("recentCheckIns.title")}</caption>
								<thead><tr>{["logs.columns.createdAt", "recentCheckIns.ticketId", "category", "checkInName", "checkInPhone", "logs.columns.actor"].map(key => <th scope="col" key={key}>{t(key)}</th>)}</tr></thead>
								<tbody>{checkIns.data.items.map(event => <tr key={event.id}>
									<td><TicketTime value={event.createdAt} />{event.isOverride && <span>{t("logs.types.override")}</span>}</td>
									<td>{event.ticketId || t("notAvailable")}</td>
									<td>{event.category ? t(`categories.${event.category}`) : t("notAvailable")}</td>
									<td>{event.recipientName?.trim() || t("notAvailable")}</td>
									<td>{event.recipientPhone?.trim() || t("notAvailable")}</td>
									<td>{event.actorName || t("notAvailable")}</td>
								</tr>)}</tbody>
							</table>
						</div>}
						<Pagination page={page} total={checkIns.data.total} pageSize={checkIns.data.pageSize} setPage={setPage} />
					</>}
				</>}
			</AccordionPanel>
		</AccordionItem>
	</Accordion>;
}
