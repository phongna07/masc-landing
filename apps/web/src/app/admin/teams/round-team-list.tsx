"use client";

import type { RoundId } from "@masc-landing/api/rounds";
import { TEAM_SIZE } from "@masc-landing/api/registration";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { ConfirmationDialog } from "@masc-landing/ui/components/confirmation-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRightIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { queryClient, trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, AdminMetrics, formatDate } from "../admin-state";

const targets: Record<RoundId, RoundId[]> = { "0.5": ["1", "2"], "1": ["2"], "2": ["3"], "3": [] };

export default function RoundTeamList({ round }: { round: RoundId }) {
  const t = useTranslations("Admin"); const locale = useLocale();
  const [selected, setSelected] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const teams = useQuery(trpc.admin.listTeams.queryOptions({ round }));
  const stats = useQuery(trpc.admin.getTeamStats.queryOptions({ round }));
  const promote = useMutation(trpc.admin.promoteTeams.mutationOptions({ onSuccess: async ({ results }) => {
    const succeeded = results.filter((result) => result.success).length;
    const failed = results.length - succeeded;
    const conflicts = results.flatMap((result) => result.success ? [] : result.conflictingEmails).join(", ");
    toast.success(t("teams.promotionResult", { succeeded, failed }), {
      description: conflicts ? t("teams.promotionConflicts", { emails: conflicts }) : undefined,
    }); setSelected([]);
    await Promise.all([queryClient.invalidateQueries({ queryKey: trpc.admin.listTeams.queryKey({ round }) }),
      ...targets[round].map((targetRound) => queryClient.invalidateQueries({ queryKey: trpc.admin.listTeams.queryKey({ round: targetRound }) }))]);
  }, onError: () => toast.error(t("teams.promotionError")) }));
  const visibleTeams = teams.data?.filter((team) => statusFilter === "all" || team.status === statusFilter) ?? [];
  const approvedIds = visibleTeams.filter((team) => team.status === "approved").map((team) => team.id);
  const toggleAll = () => setSelected(selected.length === approvedIds.length ? [] : approvedIds);
  const runPromotion = (targetRound: RoundId) => {
    if (!selected.length) return;
    if (round === "0.5" && (targetRound === "1" || targetRound === "2")) promote.mutate({ sourceRound: round, targetRound, teamIds: selected });
    else if (round === "1" && targetRound === "2") promote.mutate({ sourceRound: round, targetRound, teamIds: selected });
    else if (round === "2" && targetRound === "3") promote.mutate({ sourceRound: round, targetRound, teamIds: selected });
  };
  return <><Link className="admin-back-link" href="/admin/teams">← {t("teams.backToRounds")}</Link>
    <AdminHeading eyebrow={t("eyebrow")} title={t("teams.roundTitle", { round })} description={t("teams.roundDescription", { round })} />
    <AdminMetrics label={t("stats.label")} isPending={stats.isPending} isError={stats.isError} errorLabel={t("stats.error")}
      retry={() => stats.refetch()} retryLabel={t("actions.retry")} locale={locale} metrics={[
        { label: t("stats.totalTeams"), value: stats.data?.totalTeams }, { label: t("stats.totalParticipants"), value: stats.data?.totalParticipants },
        { label: t("stats.pendingTeams"), value: stats.data?.pendingTeams }, { label: t("stats.approvedTeams"), value: stats.data?.approvedTeams },
        { label: t("stats.rejectedTeams"), value: stats.data?.rejectedTeams },
      ]} />
    <div className="admin-team-toolbar">
      {targets[round].length > 0 && <div className="admin-status-actions admin-promotion-actions">{targets[round].map((targetRound) => <ConfirmationDialog
        key={targetRound}
        trigger={<Button aria-busy={promote.isPending} className="admin-promotion-button"
          disabled={!selected.length || promote.isPending}>
          <ArrowUpRightIcon />{t("teams.promoteSelected", { round: targetRound, count: selected.length })}</Button>}
        title={t("teams.promotionConfirmation.title", { count: selected.length, round: targetRound })}
        description={t("teams.promotionConfirmation.description", { count: selected.length, round: targetRound })}
        confirmLabel={t("teams.promotionConfirmation.confirm", { count: selected.length })}
        cancelLabel={t("actions.cancel")}
        icon={<ArrowUpRightIcon />}
        onConfirm={() => runPromotion(targetRound)}
      />)}</div>}
      <div className="admin-status-actions admin-status-filter" role="group" aria-label={t("teams.statusFilter")}>
        {(["all", "pending", "approved", "rejected"] as const).map((status) => <Button
          aria-pressed={statusFilter === status} className="admin-status-filter-button" data-status={status} key={status}
          size="sm" variant="ghost" onClick={() => { setStatusFilter(status); setSelected([]); }}>
          {status === "all" ? t("teams.filterAll") : t(`values.status.${status}`)}</Button>)}
      </div>
    </div>
    {teams.isPending ? <AdminLoading /> : teams.isError ? <AdminError title={t("errors.loadTitle")} description={t("errors.teams")}
      retry={() => teams.refetch()} retryLabel={t("actions.retry")} /> : teams.data.length === 0 ?
      <AdminEmpty title={t("teams.emptyTitle")} description={t("teams.emptyDescription")} /> :
      <Card className="admin-table-card"><CardContent className="admin-table-scroll"><table className="admin-table admin-team-table">
        <thead><tr><th><input type="checkbox" aria-label={t("teams.selectAll")} checked={approvedIds.length > 0 && selected.length === approvedIds.length} onChange={toggleAll} /></th>
          <th>{t("fields.team")}</th><th>{t("fields.captain")}</th><th>{t("fields.members")}</th><th>{t("fields.status")}</th><th>{t("fields.created")}</th><th /></tr></thead>
        <tbody>{visibleTeams.map((team) => <tr key={team.id}><td><input type="checkbox" aria-label={t("teams.selectTeam", { team: team.name })}
          disabled={team.status !== "approved"} checked={selected.includes(team.id)} onChange={() => setSelected((items) => items.includes(team.id) ? items.filter((id) => id !== team.id) : [...items, team.id])} /></td>
          <td><Link className="admin-row-link" href={`/admin/teams/round-${round}/${team.id}` as Route}><strong>{team.name}</strong></Link></td>
          <td><strong>{team.captainName}</strong><span>{team.captainEmail}</span></td><td>{t("values.memberCount", { count: team.memberCount, required: TEAM_SIZE })}</td>
          <td><span className={`status-badge status-${team.status}`}>{t(`values.status.${team.status}`)}</span></td><td>{formatDate(team.createdAt, locale)}</td>
          <td><Link className="admin-view-link" href={`/admin/teams/round-${round}/${team.id}` as Route}><ChevronRightIcon /></Link></td></tr>)}</tbody>
      </table></CardContent></Card>}
  </>;
}
