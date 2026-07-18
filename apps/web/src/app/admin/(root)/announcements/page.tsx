"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImageIcon, MegaphoneIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/hero-brand-logo";
import { queryClient, trpc } from "@/utils/trpc";
import { AdminError, AdminHeading, AdminLoading } from "../../admin-state";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function AdminAnnouncementsPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const announcements = useQuery(trpc.announcements.list.queryOptions());
  const createUploadUrl = useMutation(trpc.announcements.createUploadUrl.mutationOptions());
  const createAnnouncement = useMutation(trpc.announcements.create.mutationOptions());
  const deleteAnnouncement = useMutation(trpc.announcements.delete.mutationOptions());
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const chooseFile = (next: File | null) => {
    setError(null);
    if (!next) { setFile(null); return; }
    if (!allowedTypes.has(next.type)) { setError(t("announcements.errors.imageType")); return; }
    if (next.size > MAX_IMAGE_SIZE) { setError(t("announcements.errors.imageSize")); return; }
    setFile(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanContent = content.trim();
    if (!cleanContent) { setError(t("announcements.errors.required")); return; }
    if (cleanContent.length > 5000) { setError(t("announcements.errors.tooLong")); return; }
    setError(null);
    try {
      let image: { uploadId: string; filename: string; mimeType: string; fileSize: number } | undefined;
      if (file) {
        const metadata = { filename: file.name, mimeType: file.type, fileSize: file.size };
        const upload = await createUploadUrl.mutateAsync(metadata);
        const response = await fetch(upload.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!response.ok) throw new Error("UPLOAD_FAILED");
        image = { ...metadata, uploadId: upload.uploadId };
      }
      await createAnnouncement.mutateAsync({ content: cleanContent, image });
      setContent("");
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: trpc.announcements.list.queryKey() });
      toast.success(t("announcements.success.created"));
    } catch {
      setError(t("announcements.errors.create"));
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t("announcements.deleteConfirm"))) return;
    try {
      await deleteAnnouncement.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: trpc.announcements.list.queryKey() });
      toast.success(t("announcements.success.deleted"));
    } catch {
      toast.error(t("announcements.errors.delete"));
    }
  };

  const pending = createUploadUrl.isPending || createAnnouncement.isPending;
  return <>
    <AdminHeading eyebrow={t("eyebrow")} title={t("announcements.title")} description={t("announcements.description")} />
    <Card className="announcement-composer"><CardHeader><CardTitle>{t("announcements.composeTitle")}</CardTitle></CardHeader><CardContent>
      <form onSubmit={submit} className="announcement-form" noValidate>
        <Label htmlFor="announcement-content">{t("announcements.contentLabel")}</Label>
        <Textarea id="announcement-content" value={content} maxLength={5000} rows={7} placeholder={t("announcements.placeholder")} onChange={(event) => setContent(event.target.value)} aria-invalid={!!error} />
        <span className="field-hint">{t("announcements.characters", { count: content.length })}</span>
        {previewUrl && <div className="announcement-image-preview"><img src={previewUrl} alt="" /><Button type="button" variant="outline" size="icon" onClick={() => setFile(null)} aria-label={t("announcements.removeImage")}><XIcon aria-hidden="true" /></Button></div>}
        <div className="announcement-form-actions">
          <Label className="announcement-file-button" htmlFor="announcement-image"><ImageIcon aria-hidden="true" />{file ? file.name : t("announcements.addImage")}</Label>
          <Input id="announcement-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
          <Button type="submit" disabled={pending}><SendIcon aria-hidden="true" />{pending ? t("announcements.publishing") : t("announcements.publish")}</Button>
        </div>
        <span className="field-hint">{t("announcements.imageHint")}</span>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </CardContent></Card>

    {announcements.isPending ? <AdminLoading /> : announcements.isError ? <AdminError title={t("errors.loadTitle")} description={t("errors.announcements")} retry={() => announcements.refetch()} retryLabel={t("actions.retry")} /> : (
      <div className="announcement-feed admin-announcement-feed">
        {announcements.data.length === 0 ? <Card className="announcement-empty"><MegaphoneIcon aria-hidden="true" /><h2>{t("announcements.emptyTitle")}</h2><p>{t("announcements.emptyDescription")}</p></Card> : announcements.data.map((item) => (
          <AnnouncementCard key={item.id} item={item} locale={locale} organizer={t("announcements.organizer")} deleteLabel={t("announcements.delete")} deleting={deleteAnnouncement.isPending} onDelete={() => remove(item.id)} />
        ))}
      </div>
    )}
  </>;
}

function AnnouncementCard({ item, locale, organizer, deleteLabel, deleting, onDelete }: { item: { id: string; content: string; imageUrl: string | null; createdAt: string }; locale: string; organizer: string; deleteLabel: string; deleting: boolean; onDelete: () => void }) {
  return <Card className="announcement-post">
    <CardHeader className="announcement-post-header"><div className="announcement-avatar"><BrandLogo /></div><div><CardTitle>{organizer}</CardTitle><time dateTime={new Date(item.createdAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div><Button type="button" variant="ghost" size="icon" disabled={deleting} onClick={onDelete} aria-label={deleteLabel}><Trash2Icon aria-hidden="true" /></Button></CardHeader>
    <CardContent><p className="announcement-content">{item.content}</p>{item.imageUrl && <img className="announcement-image" src={item.imageUrl} alt="" />}</CardContent>
  </Card>;
}
