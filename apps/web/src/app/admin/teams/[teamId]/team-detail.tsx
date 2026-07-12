"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminLoading, formatDate } from "../../admin-state";

export default function TeamDetail({ teamId }: { teamId: string }) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const team = useQuery(trpc.admin.getTeam.queryOptions({ teamId }));

  if (team.isPending) return <AdminLoading />;
  if (team.isError) {
    if (team.error.data?.code === "NOT_FOUND") return <AdminEmpty title={t("detail.notFoundTitle")} description={t("detail.notFoundDescription")} />;
    return <AdminError title={t("errors.loadTitle")} description={t("errors.detail")} retry={() => team.refetch()} retryLabel={t("actions.retry")} />;
  }

  return <>
    <Link className="admin-back-link" href="/admin/teams"><ArrowLeftIcon aria-hidden="true" />{t("actions.backToTeams")}</Link>
    <div className="admin-detail-heading">
      <div><p>{t("detail.eyebrow")}</p><h1>{team.data.name}</h1></div>
      <span className={`status-badge status-${team.data.status}`}>{t(`values.status.${team.data.status}`)}</span>
    </div>
    <div className="admin-detail-grid">
      <Card className="dashboard-card"><CardHeader><CardTitle>{t("detail.registration")}</CardTitle></CardHeader><CardContent className="detail-list">
        <Detail label={t("fields.created")} value={formatDate(team.data.createdAt, locale)} />
        <Detail label={t("fields.members")} value={String(team.data.members.length)} />
        <Detail label={t("fields.status")} value={t(`values.status.${team.data.status}`)} />
      </CardContent></Card>
      <Card className="dashboard-card"><CardHeader><CardTitle>{t("detail.captainContact")}</CardTitle></CardHeader><CardContent className="detail-list">
        <Detail label={t("fields.name")} value={team.data.captainName} />
        <Detail label={t("fields.email")} value={team.data.captainEmail} />
        <Detail label={t("fields.phone")} value={team.data.captainPhone} />
      </CardContent></Card>
    </div>
    <Card className="admin-table-card"><CardHeader><CardTitle>{t("detail.roster")}</CardTitle></CardHeader><CardContent className="admin-table-scroll">
      <table className="admin-table"><thead><tr><th scope="col">{t("fields.member")}</th><th scope="col">{t("fields.email")}</th><th scope="col">{t("fields.university")}</th><th scope="col">{t("fields.role")}</th></tr></thead>
        <tbody>{team.data.members.map((member) => <tr key={member.id}><td><strong>{member.fullName}</strong></td><td>{member.email}</td><td>{member.universityName}</td><td>{member.isCaptain && <span className="captain-tag">{t("values.captain")}</span>}</td></tr>)}</tbody>
      </table>
    </CardContent></Card>
    <Button className="admin-mobile-back" variant="outline" render={<Link href="/admin/teams" />}><ArrowLeftIcon aria-hidden="true" />{t("actions.backToTeams")}</Button>
  </>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
