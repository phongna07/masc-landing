"use client";

import type { RoundId } from "@masc-landing/api/rounds";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2Icon, Clock3Icon, DownloadIcon, FileTextIcon, RefreshCwIcon, UploadIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { queryClient, trpc } from "@/utils/trpc";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const mimeTypes: Record<string, string> = { pdf: "application/pdf", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };

export default function RoundSubmission({ round }: { round: RoundId }) {
  const t = useTranslations("Dashboard"); const format = useFormatter();
  const input = { round };
  const submission = useQuery(trpc.roundSubmission.current.queryOptions(input));
  const [description, setDescription] = useState(""); const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState(false); const [error, setError] = useState<string | null>(null);
  const createUploadUrl = useMutation(trpc.roundSubmission.createUploadUrl.mutationOptions());
  const finalize = useMutation(trpc.roundSubmission.finalize.mutationOptions({ onSuccess: async () => {
    toast.success(t("round.success", { round })); setEditing(false); setFile(null);
    await queryClient.invalidateQueries({ queryKey: trpc.roundSubmission.current.queryKey(input) });
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
    ? t("round.submittedTitle", { round })
    : status === "limit"
      ? t("round.limitTitle", { round })
    : status === "unavailable"
      ? t("round.unavailableTitle", { round })
      : t(existing ? "round.replaceTitle" : "round.openTitle", { round });
  const statusDescription = status === "submitted"
    ? t("round.submittedAt", { date: format.dateTime(new Date(existing!.updatedAt), { dateStyle: "medium", timeStyle: "short" }) })
    : status === "limit"
      ? t("round.limitDescription")
    : status === "unavailable"
      ? t("round.unavailableDescription")
      : t(existing ? "round.replaceDescription" : "round.openDescription");

  const previewKey = existing ? `${existing.attemptNumber}:${String(existing.updatedAt)}` : null;
  useEffect(() => {
    if (!previewKey || showForm || previewedSubmission.current === previewKey) return;
    previewedSubmission.current = previewKey;
    preview.mutate({ round });
  }, [previewKey, showForm, round, preview.mutate]);
  if (submission.isPending) return <StateCard loading />;
  if (submission.isError) return <StateCard title={t("round.errors.loadTitle", { round })} description={t("round.errors.load")} retry={() => submission.refetch()} />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null); const cleanDescription = description.trim();
    if (!cleanDescription) return setError(t("validation.required"));
    if (cleanDescription.length > 5000) return setError(t("round.errors.descriptionLength"));
    if (!file) return setError(t("round.errors.fileRequired"));
    const mimeType = mimeTypes[file.name.split(".").pop()?.toLowerCase() ?? ""];
    if (!mimeType) return setError(t("round.errors.fileType"));
    if (file.size === 0 || file.size > MAX_FILE_SIZE) return setError(t("round.errors.fileSize"));
    const metadata = { round, filename: file.name, mimeType, fileSize: file.size };
    try {
      const upload = await createUploadUrl.mutateAsync(metadata);
      const response = await fetch(upload.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": mimeType } });
      if (!response.ok) throw new Error("UPLOAD_FAILED");
      await finalize.mutateAsync({ ...metadata, uploadId: upload.uploadId, description: cleanDescription });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (message === "ATTEMPT_LIMIT_REACHED" || message === "SUBMISSION_CONFLICT") {
        await submission.refetch();
        setEditing(false);
        toast.error(t(message === "ATTEMPT_LIMIT_REACHED" ? "round.errors.limit" : "round.errors.conflict"));
      } else setError(t("round.errors.submit"));
    }
  };

  return <div className="round-panel">
    <Card className={`dashboard-card round-status-card round-status-${status}`}>
      <CardHeader className="round-status-header"><p className="dashboard-card-index">01 / {t("tabs.round", { round })}</p>
        <div className="round-status-heading"><span className="round-status-icon" aria-hidden="true">{status === "submitted" ? <CheckCircle2Icon /> : <Clock3Icon />}</span>
          <div><CardTitle>{statusTitle}</CardTitle><p>{statusDescription}</p></div></div>
        <div className="round-status-actions"><p className="round-attempts">{t("round.attemptsUsed", { used: attemptsUsed, max: maxAttempts })}</p>
          {status === "submitted" && canSubmit && <Button variant="outline" onClick={() => { setDescription(existing!.description); setEditing(true); }}>{t("round.replace")}</Button>}</div>
      </CardHeader>
    {existing && !showForm && <CardContent className="submission-details"><div className="submission-description"><Label>{t("round.descriptionLabel")}</Label><p>{existing.description}</p></div>
      <div className="submission-file"><FileTextIcon aria-hidden="true" /><div><strong>{existing.originalFilename}</strong><span>{formatBytes(existing.fileSize)}</span></div>
        <Button variant="outline" disabled={download.isPending} onClick={() => download.mutate(input)}><DownloadIcon aria-hidden="true" />{t("round.download")}</Button></div>
      {preview.data?.previewUrl && <div className="submission-preview"><Label>{t("round.previewLabel")}</Label><iframe src={preview.data.previewUrl} title={t("round.previewTitle", { filename: existing.originalFilename })} /></div>}
    </CardContent>}
    {existing?.feedback && !showForm && <CardContent className="participant-feedback"><div className="submission-description"><Label>{t("round.feedbackTitle")}</Label><p>{existing.feedback}</p></div></CardContent>}
    {showForm && <form onSubmit={submit} className="round-submission-form" noValidate>
      <CardContent className="round-submission-fields"><Field label={t("round.descriptionLabel")}><Textarea value={description} maxLength={5000} rows={8} onChange={(event) => setDescription(event.target.value)} /><span className="field-hint">{t("round.characters", { count: description.length })}</span></Field>
      <Field label={t("round.fileLabel")}><Input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span className="field-hint">{t("round.fileHint")}</span></Field></CardContent>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="registration-submit">{editing ? <Button type="button" variant="ghost" onClick={() => { setEditing(false); setError(null); }}>{t("round.cancel")}</Button> : <span />}
      <Button type="submit" size="lg" disabled={createUploadUrl.isPending || finalize.isPending}><UploadIcon aria-hidden="true" />{finalize.isPending || createUploadUrl.isPending ? t("round.uploading") : t("round.submit", { round })}</Button></div></form>}
    </Card>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="dashboard-field field-full"><Label>{label}</Label>{children}</div>; }
function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function StateCard({ loading, title, description, retry }: { loading?: boolean; title?: string; description?: string; retry?: () => void }) {
  const t = useTranslations("Dashboard");
  return <Card className="dashboard-state-card"><CardHeader><CardTitle>{loading ? t("actions.loading") : title}</CardTitle></CardHeader>{description && <CardContent><p>{description}</p>{retry && <Button onClick={retry}><RefreshCwIcon aria-hidden="true" />{t("actions.retry")}</Button>}</CardContent>}</Card>;
}
