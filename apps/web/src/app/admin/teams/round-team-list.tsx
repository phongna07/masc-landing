"use client";

import type { RoundId } from "@masc-landing/api/rounds";
import { TEAM_SIZE } from "@masc-landing/api/registration";
import { awarenessSources } from "@masc-landing/api/registration-schema";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { ConfirmationDialog } from "@masc-landing/ui/components/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@masc-landing/ui/components/dropdown-menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRightIcon, BanIcon, ChevronDownIcon, ChevronRightIcon, FileSpreadsheetIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useRoundLabel } from "@/hooks/use-round-label";
import { queryClient, trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, AdminMetrics, formatDate } from "../admin-state";
import { exportTeamsToExcel } from "./team-excel-export";

const targets: Record<RoundId, RoundId[]> = { "0.5": ["1", "2"], "1": ["2"], "2": ["3"], "3": [] };
const mailFilters = ["pending", "failed", "sent", "all"] as const;

export default function RoundTeamList({ round }: { round: RoundId }) {
  const t = useTranslations("Admin"); const locale = useLocale();
  const roundLabel = useRoundLabel();
  const [selected, setSelected] = useState<string[]>([]);
  const [eliminationTarget, setEliminationTarget] = useState<boolean | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [isExporting, setIsExporting] = useState(false);
  const teams = useQuery(trpc.admin.listTeams.queryOptions({ round }));
  const stats = useQuery(trpc.admin.getTeamStats.queryOptions({ round }));
  const promote = useMutation(trpc.admin.promoteTeams.mutationOptions({
    onSuccess: async ({ results }) => {
      const succeeded = results.filter((result) => result.success).length;
      const failed = results.length - succeeded;
      const conflicts = results.flatMap((result) => result.success ? [] : result.conflictingEmails).join(", ");
      toast.success(t("teams.promotionResult", { succeeded, failed }), {
        description: conflicts ? t("teams.promotionConflicts", { emails: conflicts }) : undefined,
      }); setSelected([]);
      await Promise.all([queryClient.invalidateQueries({ queryKey: trpc.admin.listTeams.queryKey({ round }) }),
      ...targets[round].map((targetRound) => queryClient.invalidateQueries({ queryKey: trpc.admin.listTeams.queryKey({ round: targetRound }) }))]);
    }, onError: () => toast.error(t("teams.promotionError"))
  }));
  const setEliminated = useMutation(trpc.admin.setTeamsEliminated.mutationOptions({
    onSuccess: async ({ updatedCount, isEliminated, queuedMailCount, removedMailCount }, variables) => {
      toast.success(t(isEliminated ? "teams.elimination.markSuccess" : "teams.elimination.restoreSuccess", { count: updatedCount }), {
        description: t(isEliminated ? "teams.elimination.mailQueued" : "teams.elimination.mailRemoved", {
          count: isEliminated ? queuedMailCount : removedMailCount,
        }),
      });
      setSelected([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.admin.listTeams.queryKey({ round }) }),
        queryClient.invalidateQueries({ queryKey: trpc.admin.getMailStats.queryKey() }),
        ...mailFilters.map((status) => queryClient.invalidateQueries({
          queryKey: trpc.admin.listMail.queryKey({ status }),
        })),
        ...variables.teamIds.map((teamId) => queryClient.invalidateQueries({
          queryKey: trpc.admin.getTeam.queryKey({ round, teamId }),
        })),
      ]);
    },
    onError: () => toast.error(t("teams.elimination.error")),
  }));
  const visibleTeams = teams.data?.filter((team) => statusFilter === "all" || team.status === statusFilter) ?? [];
  const showAwarenessSource = round === "0.5" && (teams.data?.some((team) => team.awarenessSource !== null) ?? false);
  const awarenessSourceCounts = stats.data?.awarenessSourceCounts;
  const awarenessMetrics = (round === "0.5" || round === "1") && awarenessSourceCounts
    ? awarenessSources.map((source) => ({
      label: t(`values.awarenessSource.${source}`),
      value: awarenessSourceCounts[source],
    }))
    : [];
  const approvedIds = visibleTeams.filter((team) => team.status === "approved").map((team) => team.id);
  const selectedTeams = teams.data?.filter((team) => selected.includes(team.id)) ?? [];
  const hasEliminatedSelection = selectedTeams.some((team) => team.isEliminated);
  const toggleAll = () => setSelected(selected.length === approvedIds.length ? [] : approvedIds);
  const runPromotion = (targetRound: RoundId) => {
    if (!selected.length) return;
    if (round === "0.5" && (targetRound === "1" || targetRound === "2")) promote.mutate({ sourceRound: round, targetRound, teamIds: selected });
    else if (round === "1" && targetRound === "2") promote.mutate({ sourceRound: round, targetRound, teamIds: selected });
    else if (round === "2" && targetRound === "3") promote.mutate({ sourceRound: round, targetRound, teamIds: selected });
  };
  const runExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const exportedTeams = await queryClient.fetchQuery({
        ...trpc.admin.exportTeams.queryOptions({ round }),
        staleTime: 0,
      });
      await exportTeamsToExcel(round, exportedTeams);
      toast.success(t("teams.exportSuccess", { count: exportedTeams.length }));
    } catch {
      toast.error(t("teams.exportError"));
    } finally {
      setIsExporting(false);
    }
  };
  const runEliminationUpdate = () => {
    if (!selected.length || eliminationTarget === null) return;
    setEliminated.mutate({ round, teamIds: selected, isEliminated: eliminationTarget });
  };
  return <><Link className="admin-back-link" href="/admin/teams">← {t("teams.backToRounds")}</Link>
    <AdminHeading eyebrow={t("eyebrow")} title={t("teams.roundTitle", { roundLabel: roundLabel(round) })} description={t("teams.roundDescription", { roundLabel: roundLabel(round) })} />
    <AdminMetrics label={t("stats.label")} isPending={stats.isPending} isError={stats.isError} errorLabel={t("stats.error")}
      retry={() => stats.refetch()} retryLabel={t("actions.retry")} locale={locale} metrics={[
        { label: t("stats.totalTeams"), value: stats.data?.totalTeams }, { label: t("stats.totalParticipants"), value: stats.data?.totalParticipants },
        { label: t("stats.pendingTeams"), value: stats.data?.pendingTeams }, { label: t("stats.approvedTeams"), value: stats.data?.approvedTeams },
        { label: t("stats.rejectedTeams"), value: stats.data?.rejectedTeams },
        ...awarenessMetrics,
      ]} />
    <div className="admin-team-toolbar">
      <div className="admin-status-actions admin-team-actions">
        <Button aria-busy={isExporting} disabled={teams.isPending || !teams.data?.length || isExporting}
          variant="outline" onClick={runExport}>
          <FileSpreadsheetIcon />{isExporting ? t("teams.exportingExcel") : t("teams.exportExcel")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-busy={setEliminated.isPending}
            disabled={!selected.length || setEliminated.isPending} variant="outline" />}>
            <BanIcon />{t("teams.elimination.button")}<ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setEliminationTarget(true)} variant="destructive">
              <BanIcon />{t("teams.elimination.mark", { count: selected.length })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEliminationTarget(false)}>
              <RotateCcwIcon />{t("teams.elimination.restore", { count: selected.length })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {targets[round].map((targetRound) => <ConfirmationDialog
          key={targetRound}
          trigger={<Button aria-busy={promote.isPending} className="admin-promotion-button"
            disabled={!selected.length || promote.isPending || hasEliminatedSelection}
            aria-describedby={hasEliminatedSelection ? "promotion-elimination-blocked" : undefined}
            title={hasEliminatedSelection ? t("teams.elimination.promotionBlocked") : undefined}>
            <ArrowUpRightIcon />{t("teams.promoteSelected", { roundLabel: roundLabel(targetRound), count: selected.length })}</Button>}
          title={t("teams.promotionConfirmation.title", { count: selected.length, roundLabel: roundLabel(targetRound) })}
          description={t("teams.promotionConfirmation.description", { count: selected.length, roundLabel: roundLabel(targetRound) })}
          confirmLabel={t("teams.promotionConfirmation.confirm", { count: selected.length })}
          cancelLabel={t("actions.cancel")}
          icon={<ArrowUpRightIcon />}
          onConfirm={() => runPromotion(targetRound)}
        />)}
        {hasEliminatedSelection && targets[round].length > 0 && <span
          className="admin-promotion-blocked" id="promotion-elimination-blocked" role="status">
          {t("teams.elimination.promotionBlocked")}
        </span>}
      </div>
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
          <th>{t("fields.team")}</th><th>{t("fields.captain")}</th><th>{t("fields.members")}</th>
          {showAwarenessSource && <th>{t("fields.awarenessSource")}</th>}
          {round === "1" && <><th>{t("fields.preferenceStatus")}</th><th>{t("fields.preferences")}</th>
            <th>{t("fields.assignedTrack")}</th></>}
          <th>{t("fields.status")}</th><th>{t("fields.isEliminated")}</th><th>{t("fields.created")}</th><th /></tr></thead>
        <tbody>{visibleTeams.map((team) => {
          const awarenessSource = team.awarenessSource
            ? `${t(`values.awarenessSource.${team.awarenessSource}`)}${team.awarenessSourceDetail ? ` — ${team.awarenessSourceDetail}` : ""}`
            : t("values.notProvided");
          return <tr key={team.id}><td><input type="checkbox" aria-label={t("teams.selectTeam", { team: team.name })}
            disabled={team.status !== "approved"} checked={selected.includes(team.id)} onChange={() => setSelected((items) => items.includes(team.id) ? items.filter((id) => id !== team.id) : [...items, team.id])} /></td>
            <td><Link className="admin-row-link" href={`/admin/teams/round-${round}/${team.id}` as Route}><strong>{team.name}</strong></Link></td>
            <td><strong>{team.captainName}</strong><span>{team.captainEmail}</span></td><td>{t("values.memberCount", { count: team.memberCount, required: TEAM_SIZE })}</td>
            {showAwarenessSource && <td>{awarenessSource}</td>}
            {round === "1" && <><td>{team.preferenceStatus ? <span className={`preference-status preference-status-${team.preferenceStatus}`}>
              {t(`values.preferenceStatus.${team.preferenceStatus}`)}</span> : "—"}</td>
              <td>{team.preferences.length ? <ol className="admin-preference-list">{team.preferences.map((preference, index) =>
                <li key={preference.id}>{index + 1}{")"} {preference.name}</li>)}</ol> : "—"}</td>
              <td>{team.assignedTrack?.name ?? "—"}</td></>}
            <td><span className={`status-badge status-${team.status}`}>{t(`values.status.${team.status}`)}</span></td>
            <td><span className="elimination-badge" data-eliminated={team.isEliminated}>
              {t(`values.boolean.${team.isEliminated}`)}</span></td><td>{formatDate(team.createdAt, locale)}</td>
            <td><Link className="admin-view-link" href={`/admin/teams/round-${round}/${team.id}` as Route}><ChevronRightIcon /></Link></td></tr>;
        })}</tbody>
      </table></CardContent></Card>}
    <ConfirmationDialog
      open={eliminationTarget !== null}
      onOpenChange={(open) => { if (!open) setEliminationTarget(null); }}
      title={eliminationTarget
        ? t("teams.elimination.markConfirmation.title", { count: selected.length })
        : t("teams.elimination.restoreConfirmation.title", { count: selected.length })}
      description={eliminationTarget
        ? t("teams.elimination.markConfirmation.description", { count: selected.length })
        : t("teams.elimination.restoreConfirmation.description", { count: selected.length })}
      confirmLabel={eliminationTarget
        ? t("teams.elimination.markConfirmation.confirm", { count: selected.length })
        : t("teams.elimination.restoreConfirmation.confirm", { count: selected.length })}
      cancelLabel={t("actions.cancel")}
      icon={eliminationTarget ? <BanIcon /> : <RotateCcwIcon />}
      tone={eliminationTarget ? "destructive" : "success"}
      onConfirm={runEliminationUpdate}
    />
  </>;
}
