"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, ArrowRightIcon, RefreshCwIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminLoading, AdminMetrics, formatDate } from "../admin-state";

const statuses = ["all", "pending", "sending", "sent", "failed"] as const;

export default function TicketMailQueue() {
	const t = useTranslations("Admin.mail.queue");
	const ticketT = useTranslations("Tickets");
	const locale = useLocale();
	const notify = useTicketNotifications();
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<(typeof statuses)[number]>("all");
	const [page, setPage] = useState(0);
	const jobs = useQuery(trpc.tickets.emailJobs.queryOptions({ status, page }, { refetchInterval: 30000 }));
	const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.tickets.emailJobs.queryKey() });
	const send = useMutation(trpc.tickets.triggerEmailSending.mutationOptions({
		onSuccess: async result => {
			notify.info(ticketT("notifications.emailSendingCompleted", { count: result.processed }));
			await Promise.all([
				refresh(),
				queryClient.invalidateQueries({ queryKey: trpc.tickets.activity.queryKey() }),
				queryClient.invalidateQueries({ queryKey: trpc.tickets.orders.queryKey() }),
				queryClient.invalidateQueries({ queryKey: trpc.tickets.orderDetail.queryKey() }),
			]);
		},
		onError: error => { notify.error(error); void refresh(); },
	}));
	return <section className="mail-queue" aria-labelledby="mail-queue-title">
		<div className="mail-team-heading"><div><h2 id="mail-queue-title">{t("title")}</h2><p>{t("description")}</p></div>
			<Button type="button" disabled={send.isPending || !jobs.data || jobs.isError || jobs.data.counts.pending + jobs.data.counts.sending === 0}
				aria-busy={send.isPending} onClick={() => send.mutate()}><SendIcon aria-hidden="true" />
				{ticketT(send.isPending ? "sendingEmails" : "triggerEmailSending")}</Button></div>
		<AdminMetrics label={t("summary")} metrics={statuses.map(key => ({ label: t(`statuses.${key}`), value: jobs.data?.counts[key] }))}
			isPending={jobs.isPending} isError={jobs.isError} errorLabel={t("loadError")} retry={() => { void refresh(); }} retryLabel={t("retry")} locale={locale} />
		<div className="mail-team-toolbar"><div className="mail-filters" role="group" aria-label={t("filterLabel")}>
			{statuses.map(key => <Button key={key} type="button" size="sm" variant={status === key ? "default" : "outline"}
				aria-pressed={status === key} onClick={() => { setStatus(key); setPage(0); }}>{t(`statuses.${key}`)}</Button>)}</div>
			<Button type="button" variant="outline" disabled={jobs.isFetching} onClick={() => { void refresh(); }}><RefreshCwIcon aria-hidden="true" />{t("refresh")}</Button></div>
		{jobs.isPending ? <AdminLoading /> : jobs.isError ? <AdminError title={t("loadErrorTitle")} description={t("loadError")}
			retry={() => { void refresh(); }} retryLabel={t("retry")} /> : <>
			{jobs.data.items.length === 0 ? <AdminEmpty title={t("empty")} description={t("emptyDescription")} />
				: <Card className="admin-table-card"><CardContent className="admin-table-scroll"><table className="admin-table mail-queue-table">
					<thead><tr>{["recipient", "reference", "status", "attempts", "created", "nextAttempt", "sent"].map(key => <th scope="col" key={key}>{t(`columns.${key}`)}</th>)}</tr></thead>
					<tbody>{jobs.data.items.map(job => <tr key={job.id}>
						<td className="mail-queue-recipient">{job.toAddress}</td>
						<td>{job.orderId ? <Link className="admin-row-link" href={`/admin/tickets/purchased/${job.orderId}`}>
							{t("order", { code: job.orderCode ?? job.orderId })}</Link> : t("giftTicket")}</td>
						<td><span className={`mail-status mail-status-${job.status}`}>{t(`statuses.${job.status}`)}</span></td>
						<td>{job.attempts}</td><td>{formatDate(job.createdAt, locale)}</td>
						<td>{job.status === "pending" ? formatDate(job.nextAttemptAt, locale) : "—"}</td>
						<td>{job.sentAt ? formatDate(job.sentAt, locale) : "—"}</td>
					</tr>)}</tbody>
				</table></CardContent></Card>}
			<nav className="admin-activity-pagination" aria-label={t("pagination")}>
				<Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}><ArrowLeftIcon aria-hidden="true" />{t("previous")}</Button>
				<span>{t("page", { page: page + 1, total: jobs.data.total })}</span>
				<Button type="button" variant="outline" disabled={(page + 1) * jobs.data.pageSize >= jobs.data.total} onClick={() => setPage(page + 1)}>{t("next")}<ArrowRightIcon aria-hidden="true" /></Button>
			</nav>
		</>}
	</section>;
}
