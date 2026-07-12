"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, DownloadIcon, EyeIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminLoading, formatDate } from "../../admin-state";

export default function RoundOneDetail({ submissionId }: { submissionId: string }) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const submission = useQuery(trpc.admin.getRoundOneSubmission.queryOptions({ submissionId }));
  const download = useMutation(trpc.admin.createRoundOneDownloadUrl.mutationOptions({
    onSuccess: ({ downloadUrl }) => { setFileError(null); window.location.assign(downloadUrl); },
    onError: () => setFileError(t("errors.download")),
  }));
  const preview = useMutation(trpc.admin.createRoundOnePreviewUrl.mutationOptions({
    onSuccess: ({ previewUrl: url }) => { setFileError(null); setPreviewUrl(url); },
    onError: () => setFileError(t("errors.preview")),
  }));

  if (submission.isPending) return <AdminLoading />;
  if (submission.isError) {
    if (submission.error.data?.code === "NOT_FOUND") return <AdminEmpty title={t("roundOne.notFoundTitle")} description={t("roundOne.notFoundDescription")} />;
    return <AdminError title={t("errors.loadTitle")} description={t("errors.roundOneDetail")} retry={() => submission.refetch()} retryLabel={t("actions.retry")} />;
  }
  const data = submission.data;

  return <>
    <Link className="admin-back-link" href="/admin/round-one"><ArrowLeftIcon aria-hidden="true" />{t("actions.backToRoundOne")}</Link>
    <div className="admin-detail-heading">
      <div><p>{t("roundOne.detailEyebrow")}</p><h1>{data.teamName}</h1></div>
      <span className={`status-badge status-${data.teamStatus}`}>{t(`values.status.${data.teamStatus}`)}</span>
    </div>
    <div className="admin-detail-grid">
      <Card className="dashboard-card"><CardHeader><CardTitle>{t("roundOne.submission")}</CardTitle></CardHeader><CardContent className="detail-list">
        <Detail label={t("fields.submitted")} value={formatDate(data.updatedAt, locale)} />
        <Detail label={t("fields.originalSubmission")} value={formatDate(data.createdAt, locale)} />
        <Detail label={t("fields.fileType")} value={data.mimeType} />
      </CardContent></Card>
      <Card className="dashboard-card"><CardHeader><CardTitle>{t("detail.captainContact")}</CardTitle></CardHeader><CardContent className="detail-list">
        <Detail label={t("fields.name")} value={data.captainName} />
        <Detail label={t("fields.email")} value={data.captainEmail} />
        <Detail label={t("fields.phone")} value={data.captainPhone} />
      </CardContent></Card>
    </div>
    <Card className="dashboard-card admin-submission-card"><CardHeader><CardTitle>{t("roundOne.content")}</CardTitle></CardHeader><CardContent>
      <div className="submission-description"><strong>{t("fields.description")}</strong><p>{data.description}</p></div>
      <div className="submission-file"><FileTextIcon aria-hidden="true" /><div><strong>{data.originalFilename}</strong><span>{formatBytes(data.fileSize, locale)}</span></div><div className="admin-file-actions">
        <Button variant="outline" disabled={preview.isPending} onClick={() => preview.mutate({ submissionId })}><EyeIcon aria-hidden="true" />{t("actions.preview")}</Button>
        <Button variant="outline" disabled={download.isPending} onClick={() => download.mutate({ submissionId })}><DownloadIcon aria-hidden="true" />{t("actions.download")}</Button>
      </div></div>
      {fileError && <p className="admin-file-error" role="alert">{fileError}</p>}
      {previewUrl && <div className="submission-preview"><iframe src={previewUrl} title={t("roundOne.previewTitle", { filename: data.originalFilename })} /></div>}
    </CardContent></Card>
    <Card className="admin-table-card"><CardHeader><CardTitle>{t("detail.roster")}</CardTitle></CardHeader><CardContent className="admin-table-scroll">
      <table className="admin-table"><thead><tr><th scope="col">{t("fields.member")}</th><th scope="col">{t("fields.email")}</th><th scope="col">{t("fields.university")}</th><th scope="col">{t("fields.role")}</th></tr></thead>
        <tbody>{data.members.map((member) => <tr key={member.id}><td><strong>{member.fullName}</strong></td><td>{member.email}</td><td>{member.universityName}</td><td>{member.isCaptain && <span className="captain-tag">{t("values.captain")}</span>}</td></tr>)}</tbody>
      </table>
    </CardContent></Card>
    <Button className="admin-mobile-back" variant="outline" render={<Link href="/admin/round-one" />}><ArrowLeftIcon aria-hidden="true" />{t("actions.backToRoundOne")}</Button>
  </>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function formatBytes(bytes: number, locale: string) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024 ** exponent)} ${units[exponent - 1]}`;
}
