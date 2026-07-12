"use client";

import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, formatDate } from "../admin-state";

export default function AdminRoundOnePage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const submissions = useQuery(trpc.admin.listRoundOneSubmissions.queryOptions());

  return <>
    <AdminHeading eyebrow={t("eyebrow")} title={t("roundOne.title")} description={t("roundOne.description")} />
    {submissions.isPending ? <AdminLoading /> : submissions.isError ? (
      <AdminError title={t("errors.loadTitle")} description={t("errors.roundOne")} retry={() => submissions.refetch()} retryLabel={t("actions.retry")} />
    ) : submissions.data.length === 0 ? (
      <AdminEmpty title={t("roundOne.emptyTitle")} description={t("roundOne.emptyDescription")} />
    ) : (
      <Card className="admin-table-card"><CardContent className="admin-table-scroll">
        <table className="admin-table admin-round-one-table">
          <thead><tr><th scope="col">{t("fields.team")}</th><th scope="col">{t("fields.captain")}</th><th scope="col">{t("fields.file")}</th><th scope="col">{t("fields.size")}</th><th scope="col">{t("fields.submitted")}</th><th scope="col"><span className="sr-only">{t("actions.view")}</span></th></tr></thead>
          <tbody>{submissions.data.map((submission) => <tr key={submission.id}>
            <td><Link className="admin-row-link" href={`/admin/round-one/${submission.id}`}><strong>{submission.teamName}</strong><span>{t(`values.status.${submission.teamStatus}`)}</span></Link></td>
            <td><strong>{submission.captainName}</strong><span>{submission.captainEmail}</span></td>
            <td><strong>{submission.originalFilename}</strong><span>{submission.mimeType}</span></td>
            <td>{formatBytes(submission.fileSize, locale)}</td>
            <td>{formatDate(submission.updatedAt, locale)}</td>
            <td><Link className="admin-view-link" href={`/admin/round-one/${submission.id}`} aria-label={t("actions.viewSubmission", { team: submission.teamName })}><ChevronRightIcon aria-hidden="true" /></Link></td>
          </tr>)}</tbody>
        </table>
      </CardContent></Card>
    )}
  </>;
}

function formatBytes(bytes: number, locale: string) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024 ** exponent)} ${units[exponent - 1]}`;
}
