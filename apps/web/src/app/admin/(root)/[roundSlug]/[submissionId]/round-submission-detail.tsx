"use client";
import type { RoundId } from "@masc-landing/api/rounds";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, DownloadIcon, EyeIcon, FileTextIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRoundLabel } from "@/hooks/use-round-label";
import { queryClient, trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminLoading, formatBirthdate, formatDate } from "../../../admin-state";

export default function RoundSubmissionDetail({ round, submissionId }: { round: RoundId; submissionId: string }) {
  const t = useTranslations("Admin"); const locale = useLocale(); const input = { round, submissionId };
  const roundLabel = useRoundLabel()(round);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); const [fileError, setFileError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState(""); const [score, setScore] = useState("");
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const submission = useQuery(trpc.admin.getRoundSubmission.queryOptions(input));
  useEffect(() => { if (submission.data) { setFeedback(submission.data.feedback ?? ""); setScore(submission.data.score?.toString() ?? ""); } }, [submission.data]);
  const feedbackSaved = async (published: boolean) => { setFeedbackError(null); toast.success(t(published ? "feedback.published" : "feedback.draftSaved")); await queryClient.invalidateQueries({ queryKey: trpc.admin.getRoundSubmission.queryKey(input) }); };
  const saveDraft = useMutation(trpc.admin.saveRoundFeedbackDraft.mutationOptions({ onSuccess: () => feedbackSaved(false), onError: () => setFeedbackError(t("feedback.saveError")) }));
  const publish = useMutation(trpc.admin.publishRoundFeedback.mutationOptions({ onSuccess: () => feedbackSaved(true), onError: () => setFeedbackError(t("feedback.saveError")) }));
  const download = useMutation(trpc.admin.createRoundDownloadUrl.mutationOptions({ onSuccess: ({ downloadUrl }) => { setFileError(null); window.location.assign(downloadUrl); }, onError: () => setFileError(t("errors.download")) }));
  const preview = useMutation(trpc.admin.createRoundPreviewUrl.mutationOptions({ onSuccess: ({ previewUrl: url }) => { setFileError(null); setPreviewUrl(url); }, onError: () => setFileError(t("errors.preview")) }));
  if (submission.isPending) return <AdminLoading />;
  if (submission.isError) return submission.error.data?.code === "NOT_FOUND" ? <AdminEmpty title={t("round.notFoundTitle")} description={t("round.notFoundDescription")} /> : <AdminError title={t("errors.loadTitle")} description={t("errors.roundDetail")} retry={() => submission.refetch()} retryLabel={t("actions.retry")} />;
  const data = submission.data; const backHref = `/admin/round-${round}`; const canPreview = data.mimeType === "application/pdf";
  const submitFeedback = (published: boolean) => { const clean = feedback.trim(); const cleanScore = score.trim(); setFeedbackError(null); if (!clean) return setFeedbackError(t("feedback.required")); if (clean.length > 5000) return setFeedbackError(t("feedback.tooLong")); if (!cleanScore) return setFeedbackError(t("feedback.scoreRequired")); const numericScore = Number(cleanScore); if (!Number.isFinite(numericScore) || numericScore < 0) return setFeedbackError(t("feedback.scoreInvalid")); (published ? publish : saveDraft).mutate({ ...input, feedback: clean, score: numericScore }); };
  return <><Link className="admin-back-link" href={backHref as Route}><ArrowLeftIcon />{t("actions.backToRound", { roundLabel })}</Link>
    <div className="admin-detail-heading"><div><p>{t("round.detailEyebrow", { roundLabel })}</p><h1>{data.teamName}</h1></div><span className={`status-badge status-${data.teamStatus}`}>{t(`values.status.${data.teamStatus}`)}</span></div>
    <div className="admin-detail-grid"><Card className="dashboard-card"><CardHeader><CardTitle>{t("round.submission")}</CardTitle></CardHeader><CardContent className="detail-list"><Detail label={t("fields.submitted")} value={formatDate(data.updatedAt, locale)} /><Detail label={t("fields.originalSubmission")} value={formatDate(data.createdAt, locale)} /><Detail label={t("fields.fileType")} value={data.mimeType} /></CardContent></Card>
    <Card className="dashboard-card"><CardHeader><CardTitle>{t("detail.captainContact")}</CardTitle></CardHeader><CardContent className="detail-list"><Detail label={t("fields.name")} value={data.captainName} /><Detail label={t("fields.email")} value={data.captainEmail} /><Detail label={t("fields.phone")} value={data.captainPhone} /></CardContent></Card></div>
    <Card className="dashboard-card admin-submission-card"><CardHeader><CardTitle>{t("round.content")}</CardTitle></CardHeader><CardContent><div className="submission-description"><strong>{t("fields.description")}</strong><p>{data.description || t("values.noQuestionProvided")}</p></div><div className="submission-file"><FileTextIcon /><div><strong>{data.originalFilename}</strong><span>{formatBytes(data.fileSize, locale)}</span></div><div className="admin-file-actions">{canPreview && <Button variant="outline" disabled={preview.isPending} onClick={() => preview.mutate(input)}><EyeIcon />{t("actions.preview")}</Button>}<Button variant="outline" disabled={download.isPending} onClick={() => download.mutate(input)}><DownloadIcon />{t("actions.download")}</Button></div></div>{fileError && <p className="admin-file-error">{fileError}</p>}{canPreview && previewUrl && <div className="submission-preview"><iframe src={previewUrl} title={t("round.previewTitle", { filename: data.originalFilename })} /></div>}</CardContent></Card>
    <Card className="dashboard-card admin-feedback-card"><CardHeader><CardTitle>{t("feedback.title")}</CardTitle><p>{t(data.feedbackPublished ? "feedback.publishedStatus" : "feedback.draftStatus")}</p></CardHeader><CardContent className="admin-feedback-fields"><Label htmlFor="round-feedback">{t("feedback.label")}</Label><Textarea id="round-feedback" value={feedback} maxLength={5000} rows={8} onChange={(event) => setFeedback(event.target.value)} aria-invalid={!!feedbackError} /><span className="field-hint">{t("feedback.characters", { count: feedback.length })}</span><Label htmlFor="round-score">{t("feedback.scoreLabel")}</Label><Input id="round-score" type="number" min="0" step="any" inputMode="decimal" value={score} onChange={(event) => setScore(event.target.value)} aria-invalid={!!feedbackError} />{feedbackError && <p className="admin-file-error">{feedbackError}</p>}<div className="admin-feedback-actions"><Button variant="outline" disabled={saveDraft.isPending || publish.isPending} onClick={() => submitFeedback(false)}>{t("feedback.saveDraft")}</Button><Button disabled={saveDraft.isPending || publish.isPending} onClick={() => submitFeedback(true)}>{t("feedback.publish")}</Button></div></CardContent></Card>
    <Card className="admin-table-card"><CardHeader><CardTitle>{t("detail.roster")}</CardTitle></CardHeader><CardContent className="admin-table-scroll"><table className="admin-table"><thead><tr><th>{t("fields.member")}</th><th>{t("fields.email")}</th><th>{t("fields.birthdate")}</th><th>{t("fields.university")}</th><th>{t("fields.role")}</th></tr></thead><tbody>{data.members.map((member) => <tr key={member.id}><td><strong>{member.fullName}</strong></td><td>{member.email}</td><td>{formatBirthdate(member.birthdate, locale)}</td><td>{member.universityName}</td><td>{member.isCaptain && <span className="captain-tag">{t("values.captain")}</span>}</td></tr>)}</tbody></table></CardContent></Card>
    <Button className="admin-mobile-back" variant="outline" nativeButton={false} render={<Link href={backHref as Route} />}><ArrowLeftIcon />{t("actions.backToRound", { roundLabel })}</Button></>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function formatBytes(bytes: number, locale: string) { if (bytes < 1024) return `${bytes} B`; const units = ["KB", "MB", "GB"]; const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length); return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024 ** exponent)} ${units[exponent - 1]}`; }
