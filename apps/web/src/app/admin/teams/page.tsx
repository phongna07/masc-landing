"use client";

import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, formatDate } from "../admin-state";

export default function AdminTeamsPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const teams = useQuery(trpc.admin.listTeams.queryOptions());

  return <>
    <AdminHeading eyebrow={t("eyebrow")} title={t("teams.title")} description={t("teams.description")} />
    {teams.isPending ? <AdminLoading /> : teams.isError ? (
      <AdminError title={t("errors.loadTitle")} description={t("errors.teams")} retry={() => teams.refetch()} retryLabel={t("actions.retry")} />
    ) : teams.data.length === 0 ? (
      <AdminEmpty title={t("teams.emptyTitle")} description={t("teams.emptyDescription")} />
    ) : (
      <Card className="admin-table-card"><CardContent className="admin-table-scroll">
        <table className="admin-table admin-team-table">
          <thead><tr><th scope="col">{t("fields.team")}</th><th scope="col">{t("fields.captain")}</th><th scope="col">{t("fields.members")}</th><th scope="col">{t("fields.status")}</th><th scope="col">{t("fields.created")}</th><th scope="col"><span className="sr-only">{t("actions.view")}</span></th></tr></thead>
          <tbody>{teams.data.map((team) => <tr key={team.id}>
            <td><Link className="admin-row-link" href={`/admin/teams/${team.id}`}><strong>{team.name}</strong></Link></td>
            <td><strong>{team.captainName}</strong><span>{team.captainEmail}</span></td>
            <td>{team.memberCount}</td>
            <td><span className={`status-badge status-${team.status}`}>{t(`values.status.${team.status}`)}</span></td>
            <td>{formatDate(team.createdAt, locale)}</td>
            <td><Link className="admin-view-link" href={`/admin/teams/${team.id}`} aria-label={t("actions.viewTeam", { name: team.name })}><ChevronRightIcon aria-hidden="true" /></Link></td>
          </tr>)}</tbody>
        </table>
      </CardContent></Card>
    )}
  </>;
}
