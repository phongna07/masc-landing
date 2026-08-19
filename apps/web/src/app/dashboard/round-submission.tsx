"use client";

import type { RoundId } from "@masc-landing/api/rounds";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2Icon, Clock3Icon, DownloadIcon, FileTextIcon, MessageSquareQuoteIcon, RefreshCwIcon, UploadIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useRoundLabel } from "@/hooks/use-round-label";
import { queryClient, trpc } from "@/utils/trpc";

const mimeTypes: Record<string, string> = { pdf: "application/pdf" };

export default function RoundSubmission({ round, maxFileSize, sectionNumber = "01" }: {
  round: RoundId;
  maxFileSize: number;
  sectionNumber?: string;
}) {
  const t = useTranslations("Dashboard"); const format = useFormatter();
  const roundLabel = useRoundLabel()(round);
  const input = { round };
  const submission = useQuery(trpc.roundSubmission.current.queryOptions(input));
  const [description, setDescription] = useState(""); const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState(false); const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createUploadUrl = useMutation(trpc.roundSubmission.createUploadUrl.mutationOptions());
  const finalize = useMutation(trpc.roundSubmission.finalize.mutationOptions({ onSuccess: async () => {
    toast.success(t("round.success", { roundLabel })); setEditing(false); setFile(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.roundSubmission.current.queryKey(input) }),
      queryClient.invalidateQueries({ queryKey: trpc.roundSubmission.statuses.queryKey() }),
    ]);
  }}));
  const download = useMutation(trpc.roundSubmission.createDownloadUrl.mutationOptions({
    onSuccess: ({ downloadUrl }) => window.location.assign(downloadUrl), onError: () => toast.error(t("round.errors.download")),
  }));
  const preview = useMutation(trpc.roundSubmission.createPreviewUrl.mutationOptions());
  const previewedSubmission = useRef<string | null>(null);
  const existing = submission.data?.submission ?? null;
  const isOpen = submission.data?.isSubmissionOpen ?? false;
  const attemptsUsed = submission.data?.attemptsUsed ?? 0;
  const maxAttempts = submission.data?.maxAttempts ?? 3;
  const canSubmit = submission.data?.canSubmit ?? false;
  const showForm = canSubmit && (!existing || editing);
  const status = existing && !showForm
    ? attemptsUsed >= maxAttempts ? "limit" : "submitted"
    : !isOpen ? "unavailable" : "open";
  const statusTitle = status === "submitted"
    ? t("round.submittedTitle", { roundLabel })
    : status === "limit"
      ? t("round.limitTitle", { roundLabel })
    : status === "unavailable"
      ? t("round.unavailableTitle", { roundLabel })
      : t(existing ? "round.replaceTitle" : "round.openTitle", { roundLabel });
  const statusDescription = status === "submitted"
    ? t("round.submittedAt", { date: format.dateTime(new Date(existing!.updatedAt), { dateStyle: "medium", timeStyle: "short" }) })
    : status === "limit"
      ? t("round.limitDescription")
    : status === "unavailable"
      ? t("round.unavailableDescription")
      : t(existing ? "round.replaceDescription" : "round.openDescription");

  const previewKey = existing ? `${existing.attemptNumber}:${String(existing.updatedAt)}` : null;
  useEffect(() => {
    if (!previewKey || existing?.mimeType !== "application/pdf" || showForm || previewedSubmission.current === previewKey) return;
    previewedSubmission.current = previewKey;
    preview.mutate({ round });
  }, [previewKey, existing?.mimeType, showForm, round, preview.mutate]);
  if (submission.isPending) return <StateCard loading />;
  if (submission.isError) return <StateCard title={t("round.errors.loadTitle", { roundLabel })} description={t("round.errors.load")} retry={() => submission.refetch()} />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null); const cleanDescription = description.trim();
    if (cleanDescription.length > 5000) return setError(t("round.errors.descriptionLength"));
    if (!file) return setError(t("round.errors.fileRequired"));
    const mimeType = mimeTypes[file.name.split(".").pop()?.toLowerCase() ?? ""];
    if (!mimeType) return setError(t("round.errors.fileType"));
    if (file.size === 0 || file.size > maxFileSize) {
      return setError(t("round.errors.fileSize", { maxSize: formatUploadLimit(maxFileSize) }));
    }
    const metadata = { round, filename: file.name, mimeType, fileSize: file.size };
    setIsSubmitting(true);
    try {
      const upload = await createUploadUrl.mutateAsync(metadata);
      const response = await fetch(upload.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": mimeType } });
      if (!response.ok) throw new Error("UPLOAD_FAILED");
      await finalize.mutateAsync({ ...metadata, uploadId: upload.uploadId, description: cleanDescription });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (message === "FILE_TOO_LARGE") {
        const latest = await queryClient.fetchQuery(trpc.uploadLimits.queryOptions());
        setError(t("round.errors.fileSize", { maxSize: formatUploadLimit(latest.roundSubmission) }));
      } else if (message === "ATTEMPT_LIMIT_REACHED" || message === "SUBMISSION_CONFLICT") {
        await submission.refetch();
        setEditing(false);
        toast.error(t(message === "ATTEMPT_LIMIT_REACHED" ? "round.errors.limit" : "round.errors.conflict"));
      } else setError(t("round.errors.submit"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return <div className="round-panel">
    <Card className={`dashboard-card round-status-card round-status-${status}`}>
      <CardHeader className="round-status-header"><p className="dashboard-card-index">{sectionNumber} / {t("tabs.round", { roundLabel })}</p>
        <div className="round-status-heading"><span className="round-status-icon" aria-hidden="true">{status === "submitted" ? <CheckCircle2Icon /> : <Clock3Icon />}</span>
          <div><CardTitle>{statusTitle}</CardTitle><p>{statusDescription}</p></div></div>
        <div className="round-status-actions"><p className="round-attempts">{t("round.attemptsUsed", { used: attemptsUsed, max: maxAttempts })}</p>
          {status === "submitted" && canSubmit && <Button variant="outline" onClick={() => { setDescription(existing!.description); setEditing(true); }}>{t("round.replace")}</Button>}</div>
      </CardHeader>
    {existing && !showForm && <CardContent className="submission-details"><div className="submission-description"><Label>{t("round.descriptionLabel")}</Label><p>{existing.description || t("round.noQuestionProvided")}</p></div>
      <div className="submission-file"><FileTextIcon aria-hidden="true" /><div><strong>{existing.originalFilename}</strong><span>{formatBytes(existing.fileSize)}</span></div>
        <Button variant="outline" disabled={download.isPending} onClick={() => download.mutate(input)}><DownloadIcon aria-hidden="true" />{t("round.download")}</Button></div>
      {existing.feedback && <section className="participant-feedback" aria-labelledby={`round-${round}-feedback-title`}>
        <div className="participant-feedback-copy"><div className="participant-feedback-heading"><MessageSquareQuoteIcon aria-hidden="true" /><Label id={`round-${round}-feedback-title`}>{t("round.feedbackTitle")}</Label></div><p>{existing.feedback}</p></div>
        {existing.score !== null && <div className="participant-feedback-score"><Label>{t("round.scoreTitle")}</Label><p>{existing.score}</p></div>}
      </section>}
      {existing.mimeType === "application/pdf" && preview.data?.previewUrl && <div className="submission-preview"><Label>{t("round.previewLabel")}</Label><iframe src={preview.data.previewUrl} title={t("round.previewTitle", { filename: existing.originalFilename })} /></div>}
    </CardContent>}
    {showForm && <form onSubmit={submit} className="round-submission-form" noValidate>
      <CardContent className="round-submission-fields"><Field id="round-submission-file" label={t("round.fileLabel")}><Input id="round-submission-file" className="cv-file-input" type="file" accept=".pdf,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span className="field-hint">{t("round.fileHint", { maxSize: formatUploadLimit(maxFileSize) })}</span></Field>
      <Field id="round-submission-question" label={t("round.descriptionLabel")}><Input id="round-submission-question" className="submission-question-input" type="text" value={description} maxLength={5000} onChange={(event) => setDescription(event.target.value)} /><span className="field-hint">{t("round.characters", { count: description.length })}</span></Field></CardContent>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="registration-submit">{editing ? <Button type="button" variant="outline" onClick={() => { setEditing(false); setError(null); }}>{t("round.cancel")}</Button> : <span />}
      <Button type="submit" size="lg" disabled={isSubmitting} aria-busy={isSubmitting}><UploadIcon aria-hidden="true" />{isSubmitting ? t("round.uploading") : t("round.submit", { roundLabel })}</Button></div></form>}
    </Card>
  </div>;
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) { return <div className="dashboard-field field-full"><Label htmlFor={id}>{label}</Label>{children}</div>; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function formatUploadLimit(bytes: number) { return `${bytes / 1024 / 1024} MiB`; }
function StateCard({ loading, title, description, retry }: { loading?: boolean; title?: string; description?: string; retry?: () => void }) {
  const t = useTranslations("Dashboard");
  return <Card className="dashboard-state-card"><CardHeader><CardTitle>{loading ? t("actions.loading") : title}</CardTitle></CardHeader>{description && <CardContent><p>{description}</p>{retry && <Button onClick={retry}><RefreshCwIcon aria-hidden="true" />{t("actions.retry")}</Button>}</CardContent>}</Card>;
}
