"use client";

import type { AppRouter } from "@masc-landing/api/routers/index";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, formatDate } from "../../admin-state";

type ActivityLogOutput = inferRouterOutputs<AppRouter>["admin"]["listActivityLogs"];
type ActivityLogCursor = NonNullable<ActivityLogOutput["nextCursor"]>;

export default function AdminActivityLogPage() {
  const t = useTranslations("Admin.activityLog");
  const adminT = useTranslations("Admin");
  const locale = useLocale();
  const [cursorHistory, setCursorHistory] = useState<ActivityLogCursor[]>([]);
  const cursor = cursorHistory.at(-1);
  const logs = useQuery(trpc.admin.listActivityLogs.queryOptions({ cursor }));

  const nextPage = () => {
    if (logs.data?.nextCursor) setCursorHistory((history) => [...history, logs.data!.nextCursor!]);
  };
  const previousPage = () => setCursorHistory((history) => history.slice(0, -1));

  return <>
    <AdminHeading eyebrow={adminT("eyebrow")} title={t("title")} description={t("description")} />
    {logs.isPending ? <AdminLoading /> : logs.isError ? (
      <AdminError title={t("loadErrorTitle")} description={t("loadError")} retry={() => logs.refetch()} retryLabel={adminT("actions.retry")} />
    ) : logs.data.items.length === 0 && cursorHistory.length === 0 ? (
      <AdminEmpty title={t("emptyTitle")} description={t("emptyDescription")} />
    ) : <>
      <Card className="admin-table-card"><CardContent className="admin-table-scroll">
        <table className="admin-table admin-activity-table">
          <thead><tr>
            <th scope="col">{t("columns.time")}</th>
            <th scope="col">{t("columns.admin")}</th>
            <th scope="col">{t("columns.operation")}</th>
            <th scope="col">{t("columns.details")}</th>
            <th scope="col">{t("columns.outcome")}</th>
          </tr></thead>
          <tbody>{logs.data.items.map((log) => <tr key={log.id}>
            <td>{formatDate(log.createdAt, locale)}</td>
            <td><strong>{log.actorName}</strong><span>{log.actorEmail}</span><span>{formatRole(log.actorRole, adminT)}</span></td>
            <td><strong>{log.procedurePath}</strong><span>{t(`types.${log.procedureType}` as "types.query")}</span></td>
            <td>{log.input === null ? <span>{t("noDetails")}</span> : <details className="admin-activity-details">
              <summary>{t("viewDetails")}</summary>
              <pre>{JSON.stringify(log.input, null, 2)}</pre>
            </details>}</td>
            <td><span className={`admin-badge ${log.outcome === "success" ? "is-success" : "is-danger"}`}>
              {t(log.outcome === "success" ? "outcomes.success" : "outcomes.failure")}
            </span>{log.errorCode && <span className="admin-activity-error-code">{log.errorCode}</span>}</td>
          </tr>)}</tbody>
        </table>
      </CardContent></Card>
      <nav className="admin-activity-pagination" aria-label={t("pagination.label")}>
        <Button variant="outline" disabled={cursorHistory.length === 0 || logs.isFetching} onClick={previousPage}>
          <ChevronLeftIcon aria-hidden="true" />{t("pagination.previous")}
        </Button>
        <span>{t("pagination.page", { page: cursorHistory.length + 1 })}</span>
        <Button variant="outline" disabled={!logs.data.nextCursor || logs.isFetching} onClick={nextPage}>
          {t("pagination.next")}<ChevronRightIcon aria-hidden="true" />
        </Button>
      </nav>
    </>}
  </>;
}

function formatRole(role: string, t: ReturnType<typeof useTranslations<"Admin">>) {
  if (role === "root" || role === "professional") return t(`roles.${role}`);
  return role;
}
