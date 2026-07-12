"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { Label } from "@masc-landing/ui/components/label";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, DownloadIcon, EyeIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { queryClient, trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminLoading, formatDate } from "../../admin-state";

export default function RoundTwoDetail({ submissionId }: { submissionId: string }) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const submission = useQuery(trpc.admin.getRoundTwoSubmission.queryOptions({ submissionId }));
  useEffect(() => { if (submission.data) setFeedback(submission.data.feedback ?? ""); }, [submission.data]);
  const feedbackSaved = async (published: boolean) => {
    setFeedbackError(null);
    toast.success(t(published ? "feedback.published" : "feedback.draftSaved"));
    await queryClient.invalidateQueries({ queryKey: trpc.admin.getRoundTwoSubmission.queryKey({ submissionId }) });
  };
  const saveDraft = useMutation(trpc.admin.saveRoundTwoFeedbackDraft.mutationOptions({
    onSuccess: () => feedbackSaved(false),
    onError: () => setFeedbackError(t("feedback.saveError")),
  }));
  const publish = useMutation(trpc.admin.publishRoundTwoFeedback.mutationOptions({
    onSuccess: () => feedbackSaved(true),
    onError: () => setFeedbackError(t("feedback.saveError")),
  }));
  const download = useMutation(trpc.admin.createRoundTwoDownloadUrl.mutationOptions({
    onSuccess: ({ downloadUrl }) => { setFileError(null); window.location.assign(downloadUrl); },
    onError: () => setFileError(t("errors.download")),
  }));
  const preview = useMutation(trpc.admin.createRoundTwoPreviewUrl.mutationOptions({
    onSuccess: ({ previewUrl: url }) => { setFileError(null); setPreviewUrl(url); },
    onError: () => setFileError(t("errors.preview")),
  }));

  if (submission.isPending) return <AdminLoading />;
  if (submission.isError) {
    if (submission.error.data?.code === "NOT_FOUND") return <AdminEmpty title={t("roundTwo.notFoundTitle")} description={t("roundTwo.notFoundDescription")} />;
    return <AdminError title={t("errors.loadTitle")} description={t("errors.roundTwoDetail")} retry={() => submission.refetch()} retryLabel={t("actions.retry")} />;
  }
  const data = submission.data;
  const submitFeedback = (published: boolean) => {
    const cleanFeedback = feedback.trim();
    setFeedbackError(null);
    if (!cleanFeedback) return setFeedbackError(t("feedback.required"));
    if (cleanFeedback.length > 5000) return setFeedbackError(t("feedback.tooLong"));
    (published ? publish : saveDraft).mutate({ submissionId, feedback: cleanFeedback });
  };

  return <>
    <Link className="admin-back-link" href="/admin/round-two"><ArrowLeftIcon aria-hidden="true" />{t("actions.backToRoundTwo")}</Link>
    <div className="admin-detail-heading">
      <div><p>{t("roundTwo.detailEyebrow")}</p><h1>{data.teamName}</h1></div>
      <span className={`status-badge status-${data.teamStatus}`}>{t(`values.status.${data.teamStatus}`)}</span>
    </div>
    <div className="admin-detail-grid">
      <Card className="dashboard-card"><CardHeader><CardTitle>{t("roundTwo.submission")}</CardTitle></CardHeader><CardContent className="detail-list">
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
    <Card className="dashboard-card admin-submission-card"><CardHeader><CardTitle>{t("roundTwo.content")}</CardTitle></CardHeader><CardContent>
      <div className="submission-description"><strong>{t("fields.description")}</strong><p>{data.description}</p></div>
      <div className="submission-file"><FileTextIcon aria-hidden="true" /><div><strong>{data.originalFilename}</strong><span>{formatBytes(data.fileSize, locale)}</span></div><div className="admin-file-actions">
        <Button variant="outline" disabled={preview.isPending} onClick={() => preview.mutate({ submissionId })}><EyeIcon aria-hidden="true" />{t("actions.preview")}</Button>
        <Button variant="outline" disabled={download.isPending} onClick={() => download.mutate({ submissionId })}><DownloadIcon aria-hidden="true" />{t("actions.download")}</Button>
      </div></div>
      {fileError && <p className="admin-file-error" role="alert">{fileError}</p>}
      {previewUrl && <div className="submission-preview"><iframe src={previewUrl} title={t("roundTwo.previewTitle", { filename: data.originalFilename })} /></div>}
    </CardContent></Card>
    <Card className="dashboard-card admin-feedback-card"><CardHeader><CardTitle>{t("feedback.title")}</CardTitle><p>{t(data.feedbackPublished ? "feedback.publishedStatus" : "feedback.draftStatus")}</p></CardHeader><CardContent className="admin-feedback-fields">
      <Label htmlFor="round-two-feedback">{t("feedback.label")}</Label>
      <Textarea id="round-two-feedback" value={feedback} maxLength={5000} rows={8} onChange={(event) => setFeedback(event.target.value)} aria-invalid={!!feedbackError} />
      <span className="field-hint">{t("feedback.characters", { count: feedback.length })}</span>
      {feedbackError && <p className="admin-file-error" role="alert">{feedbackError}</p>}
      <div className="admin-feedback-actions"><Button variant="outline" disabled={saveDraft.isPending || publish.isPending} onClick={() => submitFeedback(false)}>{t("feedback.saveDraft")}</Button><Button disabled={saveDraft.isPending || publish.isPending} onClick={() => submitFeedback(true)}>{t("feedback.publish")}</Button></div>
    </CardContent></Card>
    <Card className="admin-table-card"><CardHeader><CardTitle>{t("detail.roster")}</CardTitle></CardHeader><CardContent className="admin-table-scroll">
      <table className="admin-table"><thead><tr><th scope="col">{t("fields.member")}</th><th scope="col">{t("fields.email")}</th><th scope="col">{t("fields.university")}</th><th scope="col">{t("fields.role")}</th></tr></thead>
        <tbody>{data.members.map((member) => <tr key={member.id}><td><strong>{member.fullName}</strong></td><td>{member.email}</td><td>{member.universityName}</td><td>{member.isCaptain && <span className="captain-tag">{t("values.captain")}</span>}</td></tr>)}</tbody>
      </table>
    </CardContent></Card>
    <Button className="admin-mobile-back" variant="outline" render={<Link href="/admin/round-two" />}><ArrowLeftIcon aria-hidden="true" />{t("actions.backToRoundTwo")}</Button>
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
