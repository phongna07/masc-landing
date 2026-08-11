"use client";

import { roundFromSlug } from "@masc-landing/api/rounds";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, FileSpreadsheetIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { notFound, useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useRoundLabel } from "@/hooks/use-round-label";
import { queryClient, trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, formatDate } from "../../admin-state";
import { RoundPdfExport } from "./round-pdf-export";
import { exportRoundSubmissionsToExcel } from "./round-submission-excel-export";

export default function AdminRoundPage() {
  const { roundSlug } = useParams<{ roundSlug: string }>();
  const round = roundFromSlug(roundSlug); if (!round) notFound();
  const t = useTranslations("Admin"); const locale = useLocale();
  const roundLabel = useRoundLabel()(round);
  const [isExporting, setIsExporting] = useState(false);
  const submissions = useQuery(trpc.admin.listRoundSubmissions.queryOptions({ round }));
  const submissionCount = submissions.data
    ? t("round.submissionCount", { count: submissions.data.length })
    : undefined;
  const runExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const exportedSubmissions = await queryClient.fetchQuery({
        ...trpc.admin.listRoundSubmissions.queryOptions({ round }),
        staleTime: 0,
      });
      await exportRoundSubmissionsToExcel(round, exportedSubmissions);
      toast.success(t("round.excelExport.exportSuccess", { count: exportedSubmissions.length }));
    } catch {
      toast.error(t("round.excelExport.exportError"));
    } finally {
      setIsExporting(false);
    }
  };
  return <><AdminHeading eyebrow={t("eyebrow")} title={t("round.title", { roundLabel })}
    description={t("round.description", { roundLabel })} badge={submissionCount} />
    <RoundPdfExport round={round} disabled={!submissions.data?.length} />
    <div className="admin-team-toolbar"><div className="admin-status-actions admin-team-actions">
      <Button aria-busy={isExporting} disabled={submissions.isPending || !submissions.data?.length || isExporting}
        variant="outline" onClick={runExport}>
        <FileSpreadsheetIcon />{t(isExporting ? "round.excelExport.exportingExcel" : "round.excelExport.exportExcel")}
      </Button>
    </div></div>
    {submissions.isPending ? <AdminLoading /> : submissions.isError ? <AdminError title={t("errors.loadTitle")} description={t("errors.round")} retry={() => submissions.refetch()} retryLabel={t("actions.retry")} />
    : submissions.data.length === 0 ? <AdminEmpty title={t("round.emptyTitle", { roundLabel })} description={t("round.emptyDescription")} />
    : <Card className="admin-table-card"><CardContent className="admin-table-scroll"><table className="admin-table admin-round-table">
      <thead><tr><th>{t("fields.team")}</th><th>{t("fields.captain")}</th><th>{t("fields.file")}</th><th>{t("fields.size")}</th><th>{t("fields.submitted")}</th><th><span className="sr-only">{t("actions.view")}</span></th></tr></thead>
      <tbody>{submissions.data.map((submission) => <tr key={submission.id}><td><Link className="admin-row-link" href={`/admin/${roundSlug}/${submission.id}` as Route}><strong>{submission.teamName}</strong><span>{t(`values.status.${submission.teamStatus}`)}</span></Link></td>
        <td><strong>{submission.captainName}</strong><span>{submission.captainEmail}</span></td><td><strong>{submission.originalFilename}</strong><span>{submission.mimeType}</span></td>
        <td>{formatBytes(submission.fileSize, locale)}</td><td>{formatDate(submission.updatedAt, locale)}</td><td><Link className="admin-view-link" href={`/admin/${roundSlug}/${submission.id}` as Route} aria-label={t("actions.viewSubmission", { team: submission.teamName })}><ChevronRightIcon /></Link></td></tr>)}</tbody>
    </table></CardContent></Card>}</>;
}
function formatBytes(bytes: number, locale: string) { if (bytes < 1024) return `${bytes} B`; const units = ["KB", "MB", "GB"]; const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length); return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024 ** exponent)} ${units[exponent - 1]}`; }
