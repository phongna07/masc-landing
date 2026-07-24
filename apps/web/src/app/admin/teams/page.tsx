"use client";

import { TEAM_SIZE } from "@masc-landing/api/registration";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, AdminMetrics, formatDate } from "../admin-state";

export default function AdminTeamsPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const teams = useQuery(trpc.admin.listTeams.queryOptions());
  const stats = useQuery(trpc.admin.getTeamStats.queryOptions());

  return <>
    <AdminHeading eyebrow={t("eyebrow")} title={t("teams.title")} description={t("teams.description")} />
    <AdminMetrics label={t("stats.label")} isPending={stats.isPending} isError={stats.isError}
      errorLabel={t("stats.error")} retry={() => stats.refetch()} retryLabel={t("actions.retry")} locale={locale}
      metrics={[
        { label: t("stats.totalTeams"), value: stats.data?.totalTeams },
        { label: t("stats.totalParticipants"), value: stats.data?.totalParticipants },
        { label: t("stats.pendingTeams"), value: stats.data?.pendingTeams },
        { label: t("stats.approvedTeams"), value: stats.data?.approvedTeams },
        { label: t("stats.rejectedTeams"), value: stats.data?.rejectedTeams },
      ]} />
    {teams.isPending ? <AdminLoading /> : teams.isError ? (
      <AdminError title={t("errors.loadTitle")} description={t("errors.teams")} retry={() => teams.refetch()} retryLabel={t("actions.retry")} />
    ) : teams.data.length === 0 ? (
      <AdminEmpty title={t("teams.emptyTitle")} description={t("teams.emptyDescription")} />
    ) : (
      <Card className="admin-table-card"><CardContent className="admin-table-scroll">
        <table className="admin-table admin-team-table">
          <thead><tr><th scope="col">{t("fields.team")}</th><th scope="col">{t("fields.captain")}</th><th scope="col">{t("fields.members")}</th><th scope="col">{t("fields.awarenessSource")}</th><th scope="col">{t("fields.status")}</th><th scope="col">{t("fields.created")}</th><th scope="col"><span className="sr-only">{t("actions.view")}</span></th></tr></thead>
          <tbody>{teams.data.map((team) => {
            const awarenessSource = team.awarenessSource
              ? `${t(`values.awarenessSource.${team.awarenessSource}`)}${team.awarenessSourceDetail ? ` — ${team.awarenessSourceDetail}` : ""}`
              : t("values.notProvided");
            return <tr key={team.id}>
              <td><Link className="admin-row-link" href={`/admin/teams/${team.id}`}><strong>{team.name}</strong></Link></td>
              <td><strong>{team.captainName}</strong><span>{team.captainEmail}</span></td>
              <td>{t("values.memberCount", { count: team.memberCount, required: TEAM_SIZE })}</td>
              <td>{awarenessSource}</td>
              <td><span className={`status-badge status-${team.status}`}>{t(`values.status.${team.status}`)}</span></td>
              <td>{formatDate(team.createdAt, locale)}</td>
              <td><Link className="admin-view-link" href={`/admin/teams/${team.id}`} aria-label={t("actions.viewTeam", { name: team.name })}><ChevronRightIcon aria-hidden="true" /></Link></td>
            </tr>;
          })}</tbody>
        </table>
      </CardContent></Card>
    )}
  </>;
}
