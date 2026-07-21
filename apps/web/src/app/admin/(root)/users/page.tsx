"use client";

import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, AdminMetrics, formatDate } from "../../admin-state";

export default function AdminUsersPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const users = useQuery(trpc.admin.listUsers.queryOptions());
  const stats = useQuery(trpc.admin.getUserStats.queryOptions());

  return <>
    <AdminHeading eyebrow={t("eyebrow")} title={t("users.title")} description={t("users.description")} />
    <AdminMetrics label={t("stats.label")} isPending={stats.isPending} isError={stats.isError}
      errorLabel={t("stats.error")} retry={() => stats.refetch()} retryLabel={t("actions.retry")} locale={locale}
      metrics={[{ label: t("stats.totalUsers"), value: stats.data?.totalUsers }]} />
    {users.isPending ? <AdminLoading /> : users.isError ? (
      <AdminError title={t("errors.loadTitle")} description={t("errors.users")} retry={() => users.refetch()} retryLabel={t("actions.retry")} />
    ) : users.data.length === 0 ? (
      <AdminEmpty title={t("users.emptyTitle")} description={t("users.emptyDescription")} />
    ) : (
      <Card className="admin-table-card"><CardContent className="admin-table-scroll">
        <table className="admin-table">
          <thead><tr><th scope="col">{t("fields.user")}</th><th scope="col">{t("fields.role")}</th><th scope="col">{t("fields.verification")}</th><th scope="col">{t("fields.created")}</th></tr></thead>
          <tbody>{users.data.map((user) => <tr key={user.id}>
            <td><strong>{user.name}</strong><span>{user.email}</span></td>
            <td><span className="admin-badge">{t(`roles.${user.role}`)}</span></td>
            <td>{t(user.emailVerified ? "values.verified" : "values.unverified")}</td>
            <td>{formatDate(user.createdAt, locale)}</td>
          </tr>)}</tbody>
        </table>
      </CardContent></Card>
    )}
  </>;
}
