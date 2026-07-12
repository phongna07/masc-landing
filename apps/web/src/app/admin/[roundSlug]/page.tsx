"use client";

import { roundFromSlug } from "@masc-landing/api/rounds";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { notFound, useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, formatDate } from "../admin-state";

export default function AdminRoundPage() {
  const { roundSlug } = useParams<{ roundSlug: string }>();
  const round = roundFromSlug(roundSlug); if (!round) notFound();
  const t = useTranslations("Admin"); const locale = useLocale();
  const submissions = useQuery(trpc.admin.listRoundSubmissions.queryOptions({ round }));
  return <><AdminHeading eyebrow={t("eyebrow")} title={t("round.title", { round })} description={t("round.description", { round })} />
    {submissions.isPending ? <AdminLoading /> : submissions.isError ? <AdminError title={t("errors.loadTitle")} description={t("errors.round")} retry={() => submissions.refetch()} retryLabel={t("actions.retry")} />
    : submissions.data.length === 0 ? <AdminEmpty title={t("round.emptyTitle", { round })} description={t("round.emptyDescription")} />
    : <Card className="admin-table-card"><CardContent className="admin-table-scroll"><table className="admin-table admin-round-table">
      <thead><tr><th>{t("fields.team")}</th><th>{t("fields.captain")}</th><th>{t("fields.file")}</th><th>{t("fields.size")}</th><th>{t("fields.submitted")}</th><th><span className="sr-only">{t("actions.view")}</span></th></tr></thead>
      <tbody>{submissions.data.map((submission) => <tr key={submission.id}><td><Link className="admin-row-link" href={`/admin/${roundSlug}/${submission.id}` as Route}><strong>{submission.teamName}</strong><span>{t(`values.status.${submission.teamStatus}`)}</span></Link></td>
        <td><strong>{submission.captainName}</strong><span>{submission.captainEmail}</span></td><td><strong>{submission.originalFilename}</strong><span>{submission.mimeType}</span></td>
        <td>{formatBytes(submission.fileSize, locale)}</td><td>{formatDate(submission.updatedAt, locale)}</td><td><Link className="admin-view-link" href={`/admin/${roundSlug}/${submission.id}` as Route} aria-label={t("actions.viewSubmission", { team: submission.teamName })}><ChevronRightIcon /></Link></td></tr>)}</tbody>
    </table></CardContent></Card>}</>;
}
function formatBytes(bytes: number, locale: string) { if (bytes < 1024) return `${bytes} B`; const units = ["KB", "MB", "GB"]; const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length); return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024 ** exponent)} ${units[exponent - 1]}`; }
