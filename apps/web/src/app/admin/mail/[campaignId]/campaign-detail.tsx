"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { ConfirmationDialog } from "@masc-landing/ui/components/confirmation-dialog";
import { Input } from "@masc-landing/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveIcon, ArrowLeftIcon, RefreshCwIcon, RotateCcwIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, formatDate } from "../../admin-state";
import CampaignEditor from "../campaign-editor";

const deliveryFilters = ["all", "not_sent", "failed", "sent"] as const;
type DeliveryFilter = (typeof deliveryFilters)[number];

export default function CampaignDetail({ campaignId }: { campaignId: string }) {
	const t = useTranslations("Admin.mail");
	const queryClient = useQueryClient();
	const [dirty, setDirty] = useState(false);
	const campaign = useQuery(trpc.admin.getMailCampaign.queryOptions({ campaignId }));
	const archive = useMutation(trpc.admin.setMailCampaignArchived.mutationOptions({
		onSuccess: async (_, variables) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: trpc.admin.getMailCampaign.queryKey({ campaignId }) }),
				queryClient.invalidateQueries({ queryKey: trpc.admin.listMailCampaigns.queryKey({ archived: variables.archived }) }),
				queryClient.invalidateQueries({ queryKey: trpc.admin.listMailCampaigns.queryKey({ archived: !variables.archived }) }),
			]);
			toast.success(t(variables.archived ? "archiveSuccess" : "restoreSuccess"));
		},
		onError: () => toast.error(t("archiveError")),
	}));
	if (campaign.isPending) return <AdminLoading />;
	if (campaign.isError) return campaign.error.data?.code === "NOT_FOUND"
		? <AdminEmpty title={t("notFound")} description={t("notFoundDescription")} />
		: <AdminError title={t("loadErrorTitle")} description={t("loadError")} retry={() => campaign.refetch()} retryLabel={t("retry")} />;
	const archived = campaign.data.archivedAt !== null;
	return <>
		<Link className="admin-back-link" href="/admin/mail"><ArrowLeftIcon />{t("back")}</Link>
		<div className="admin-heading-actions"><AdminHeading eyebrow={t("eyebrow")} title={campaign.data.name}
			description={archived ? t("archivedDescription") : t("manageDescription")} />
			{archived ? <Button variant="outline" disabled={archive.isPending}
				onClick={() => archive.mutate({ campaignId, archived: false })}><RotateCcwIcon />{t("restore")}</Button>
				: <ConfirmationDialog trigger={<Button variant="outline" disabled={archive.isPending || dirty}><ArchiveIcon />{t("archive")}</Button>}
					title={t("archiveConfirmTitle")} description={t("archiveConfirmDescription")}
					confirmLabel={t("archive")} cancelLabel={t("cancel")} icon={<ArchiveIcon />}
					onConfirm={() => archive.mutate({ campaignId, archived: true })} />}</div>
		<CampaignEditor key={String(campaign.data.updatedAt)} initial={campaign.data.input} campaignId={campaignId}
			archived={archived} onDirtyChange={setDirty} />
		<CampaignTeams campaignId={campaignId} archived={archived} dirty={dirty} />
	</>;
}

function CampaignTeams({ campaignId, archived, dirty }: { campaignId: string; archived: boolean; dirty: boolean }) {
	const t = useTranslations("Admin.mail");
	const locale = useLocale();
	const queryClient = useQueryClient();
	const [filter, setFilter] = useState<DeliveryFilter>("all");
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const [sendingIds, setSendingIds] = useState<string[]>([]);
	const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
	const input = { campaignId, status: filter, search: search || undefined };
	const teams = useQuery(trpc.admin.listMailCampaignTeams.queryOptions(input));
	const send = useMutation(trpc.admin.sendMailCampaignTeam.mutationOptions());
	const refresh = useCallback(async () => {
		await Promise.all([
			...deliveryFilters.map((status) => queryClient.invalidateQueries({
				queryKey: trpc.admin.listMailCampaignTeams.queryKey({ campaignId, status, search: search || undefined }),
			})),
			queryClient.invalidateQueries({ queryKey: trpc.admin.listMailCampaigns.queryKey({ archived: false }) }),
			queryClient.invalidateQueries({ queryKey: trpc.admin.listMailCampaigns.queryKey({ archived: true }) }),
		]);
	}, [campaignId, queryClient, search]);
	const sendOne = async (teamId: string, showToast = true) => {
		setSendingIds((current) => [...current, teamId]);
		try {
			await send.mutateAsync({ campaignId, teamId });
			if (showToast) toast.success(t("sendSuccess"));
			return true;
		} catch {
			if (showToast) toast.error(t("sendError"));
			return false;
		} finally {
			setSendingIds((current) => current.filter((id) => id !== teamId));
		}
	};
	const runBatch = async () => {
		const queue = selected.slice(0, 50);
		let cursor = 0;
		let succeeded = 0;
		let failed = 0;
		setProgress({ completed: 0, total: queue.length });
		const worker = async () => {
			while (cursor < queue.length) {
				const teamId = queue[cursor++]!;
				if (await sendOne(teamId, false)) succeeded += 1;
				else failed += 1;
				setProgress({ completed: succeeded + failed, total: queue.length });
			}
		};
		await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
		setProgress(null);
		setSelected([]);
		await refresh();
		toast.success(t("batchComplete", { succeeded, failed }));
	};
	const available = teams.data?.filter((team) => team.sendable).map((team) => team.teamId) ?? [];
	const toggleAll = () => setSelected(selected.length === Math.min(50, available.length) ? [] : available.slice(0, 50));
	return <section className="mail-campaign-teams">
		<div className="mail-team-heading"><div><h2>{t("teams.title")}</h2><p>{dirty ? t("teams.saveBeforeSending") : t("teams.description")}</p></div>
			<ConfirmationDialog trigger={<Button disabled={!selected.length || dirty || archived || progress !== null}>
				<SendIcon />{progress ? t("teams.progress", progress) : t("teams.sendSelected", { count: selected.length })}</Button>}
				title={t("teams.batchConfirmTitle", { count: selected.length })} description={t("teams.batchConfirmDescription", { count: selected.length })}
				confirmLabel={t("teams.sendSelected", { count: selected.length })} cancelLabel={t("cancel")} icon={<SendIcon />}
				onConfirm={runBatch} /></div>
		<div className="mail-team-toolbar"><div className="mail-filters" role="group" aria-label={t("teams.filterLabel")}>
			{deliveryFilters.map((status) => <Button key={status} size="sm" variant={filter === status ? "default" : "outline"}
				onClick={() => { setFilter(status); setSelected([]); }}>{t(`teams.filters.${status}`)}</Button>)}</div>
			<Input type="search" value={search} placeholder={t("teams.search")} aria-label={t("teams.search")}
				onChange={(event) => { setSearch(event.target.value); setSelected([]); }} /></div>
		{teams.isPending ? <AdminLoading /> : teams.isError ? <AdminError title={t("loadErrorTitle")} description={t("teams.loadError")}
			retry={() => teams.refetch()} retryLabel={t("retry")} /> : teams.data.length === 0
			? <AdminEmpty title={t("teams.empty")} description={t("teams.emptyDescription")} />
			: <Card className="admin-table-card"><CardContent className="admin-table-scroll"><table className="admin-table mail-delivery-table">
				<thead><tr><th><input type="checkbox" checked={available.length > 0 && selected.length === Math.min(50, available.length)}
					onChange={toggleAll} aria-label={t("teams.selectAll")} /></th><th>{t("fields.team")}</th><th>{t("fields.recipient")}</th>
					<th>{t("fields.status")}</th><th>{t("fields.attempts")}</th><th>{t("fields.lastAttempt")}</th><th>{t("actions")}</th></tr></thead>
				<tbody>{teams.data.map((team) => {
					const sending = sendingIds.includes(team.teamId);
					return <tr key={team.teamId}><td><input type="checkbox" disabled={!team.sendable || dirty || archived}
						checked={selected.includes(team.teamId)} aria-label={t("teams.selectTeam", { team: team.teamName })}
						onChange={() => setSelected((current) => current.includes(team.teamId) ? current.filter((id) => id !== team.teamId)
							: current.length >= 50 ? current : [...current, team.teamId])} /></td>
						<td><strong>{team.teamName}</strong>{!team.currentEligible && <span className="mail-ineligible">{t("teams.noLongerEligible")}</span>}</td>
						<td className="mail-recipients"><span>{team.toAddress || "—"}</span><span><b>{t("fields.cc")}:</b> {team.cc.join(", ") || "—"}</span></td>
						<td><span className={`mail-status mail-status-${sending ? "sending" : team.status}`}>{t(`teams.status.${sending ? "sending" : team.status}`)}</span>
							{team.errorMessage && <span className="mail-delivery-error" title={team.errorMessage}>{team.errorMessage}</span>}</td>
						<td>{team.attemptCount}</td><td>{team.lastAttemptedAt ? formatDate(team.lastAttemptedAt, locale) : "—"}</td>
						<td>{team.sendable && <ConfirmationDialog trigger={<Button size="sm" disabled={dirty || archived || sending || progress !== null}>
							{team.status === "failed" || team.status === "sending" ? <RefreshCwIcon /> : <SendIcon />}{sending ? t("sending") : t(team.status === "failed" || team.status === "sending" ? "retrySend" : "send")}</Button>}
							title={t("teams.sendConfirmTitle", { team: team.teamName })} description={t("teams.sendConfirmDescription", { recipient: team.toAddress })}
							confirmLabel={t("send")} cancelLabel={t("cancel")} icon={<SendIcon />}
							onConfirm={async () => { await sendOne(team.teamId); await refresh(); }} />}</td></tr>;
				})}</tbody>
			</table></CardContent></Card>}
	</section>;
}
