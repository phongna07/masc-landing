"use client";

import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, formatDate } from "../admin-state";

export default function AdminUsersPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const users = useQuery(trpc.admin.listUsers.queryOptions());

  return <>
    <AdminHeading eyebrow={t("eyebrow")} title={t("users.title")} description={t("users.description")} />
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
            <td><span className="admin-badge">{user.role ?? "user"}</span></td>
            <td>{t(user.emailVerified ? "values.verified" : "values.unverified")}</td>
            <td>{formatDate(user.createdAt, locale)}</td>
          </tr>)}</tbody>
        </table>
      </CardContent></Card>
    )}
  </>;
}
