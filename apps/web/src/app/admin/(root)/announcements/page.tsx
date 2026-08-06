"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { ConfirmationDialog } from "@masc-landing/ui/components/confirmation-dialog";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@masc-landing/ui/components/dialog";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImageIcon, MegaphoneIcon, PencilIcon, RotateCcwIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import mascLogo from "@/assets/masc-logo-new.png";
import { SafeLinkifiedText } from "@/components/safe-linkified-text";
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
          <AnnouncementCard key={item.id} item={item} locale={locale} organizer={t("announcements.organizer")} deleteLabel={t("announcements.delete")} deleting={deleteAnnouncement.isPending}
            confirmation={{ title: t("announcements.deleteConfirmation.title"), description: t("announcements.deleteConfirmation.description"), confirm: t("announcements.deleteConfirmation.confirm"), cancel: t("actions.cancel") }}
            onDelete={() => void remove(item.id)} />
        ))}
      </div>
    )}
  </>;
}

function AnnouncementCard({ item, locale, organizer, deleteLabel, deleting, confirmation, onDelete }: { item: { id: string; content: string; imageUrl: string | null; createdAt: string }; locale: string; organizer: string; deleteLabel: string; deleting: boolean; confirmation: { title: string; description: string; confirm: string; cancel: string }; onDelete: () => void }) {
  return <Card className="announcement-post">
    <CardHeader className="announcement-post-header"><div className="announcement-avatar"><Image src={mascLogo} alt="" /></div><div><CardTitle>{organizer}</CardTitle><time dateTime={new Date(item.createdAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div><div className="admin-announcement-actions">
      <EditAnnouncementDialog item={item} />
      <ConfirmationDialog
        trigger={<Button type="button" variant="ghost" size="icon" disabled={deleting} aria-label={deleteLabel}><Trash2Icon aria-hidden="true" /></Button>}
        title={confirmation.title}
        description={confirmation.description}
        confirmLabel={confirmation.confirm}
        cancelLabel={confirmation.cancel}
        icon={<Trash2Icon />}
        tone="destructive"
        onConfirm={onDelete}
      />
    </div></CardHeader>
    <CardContent><p className="announcement-content"><SafeLinkifiedText text={item.content} /></p>{item.imageUrl && <img className="announcement-image" src={item.imageUrl} alt="" />}</CardContent>
  </Card>;
}

function EditAnnouncementDialog({ item }: { item: { id: string; content: string; imageUrl: string | null } }) {
  const t = useTranslations("Admin");
  const createUploadUrl = useMutation(trpc.announcements.createUploadUrl.mutationOptions());
  const updateAnnouncement = useMutation(trpc.announcements.update.mutationOptions());
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(item.content);
  const [file, setFile] = useState<File | null>(null);
  const [imageAction, setImageAction] = useState<"keep" | "remove" | "replace">("keep");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    setContent(item.content);
    setFile(null);
    setImageAction("keep");
    setError(null);
  };

  const changeOpen = (next: boolean) => {
    if (createUploadUrl.isPending || updateAnnouncement.isPending) return;
    reset();
    setOpen(next);
  };

  const chooseFile = (next: File | null) => {
    setError(null);
    if (!next) return;
    if (!allowedTypes.has(next.type)) { setError(t("announcements.errors.imageType")); return; }
    if (next.size > MAX_IMAGE_SIZE) { setError(t("announcements.errors.imageSize")); return; }
    setFile(next);
    setImageAction("replace");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanContent = content.trim();
    if (!cleanContent) { setError(t("announcements.errors.required")); return; }
    if (cleanContent.length > 5000) { setError(t("announcements.errors.tooLong")); return; }
    setError(null);
    try {
      let image: { action: "keep" } | { action: "remove" } | { action: "replace"; image: { uploadId: string; filename: string; mimeType: string; fileSize: number } };
      if (imageAction === "replace" && file) {
        const metadata = { filename: file.name, mimeType: file.type, fileSize: file.size };
        const upload = await createUploadUrl.mutateAsync(metadata);
        const response = await fetch(upload.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!response.ok) throw new Error("UPLOAD_FAILED");
        image = { action: "replace", image: { ...metadata, uploadId: upload.uploadId } };
      } else {
        image = { action: imageAction === "remove" ? "remove" : "keep" };
      }
      await updateAnnouncement.mutateAsync({ id: item.id, content: cleanContent, image });
      await queryClient.invalidateQueries({ queryKey: trpc.announcements.list.queryKey() });
      toast.success(t("announcements.success.updated"));
      reset();
      setOpen(false);
    } catch {
      setError(t("announcements.errors.update"));
    }
  };

  const pending = createUploadUrl.isPending || updateAnnouncement.isPending;
  const shownImage = imageAction === "replace" ? previewUrl : imageAction === "keep" ? item.imageUrl : null;
  const imageInputId = `announcement-edit-image-${item.id}`;

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={t("announcements.edit")} />}>
      <PencilIcon aria-hidden="true" />
    </DialogTrigger>
    <DialogContent>
      <form className="announcement-edit-form" onSubmit={submit} noValidate>
        <DialogHeader>
          <DialogTitle>{t("announcements.editDialog.title")}</DialogTitle>
          <DialogDescription>{t("announcements.editDialog.description")}</DialogDescription>
        </DialogHeader>
        <DialogClose className="announcement-edit-close" render={<Button type="button" variant="ghost" size="icon" disabled={pending} aria-label={t("actions.cancel")} />}>
          <XIcon aria-hidden="true" />
        </DialogClose>
        <div className="announcement-form announcement-edit-fields">
          <Label htmlFor={`announcement-edit-content-${item.id}`}>{t("announcements.contentLabel")}</Label>
          <Textarea id={`announcement-edit-content-${item.id}`} value={content} maxLength={5000} rows={7} placeholder={t("announcements.placeholder")} onChange={(event) => setContent(event.target.value)} disabled={pending} aria-invalid={!!error} />
          <span className="field-hint">{t("announcements.characters", { count: content.length })}</span>
          {shownImage && <div className="announcement-image-preview"><img src={shownImage} alt="" /><Button type="button" variant="outline" size="icon" disabled={pending} onClick={() => { setFile(null); setImageAction("remove"); }} aria-label={t("announcements.removeImage")}><XIcon aria-hidden="true" /></Button></div>}
          <div className="announcement-edit-image-actions">
            <Label className="announcement-file-button" htmlFor={imageInputId}><ImageIcon aria-hidden="true" />{file ? file.name : t(item.imageUrl ? "announcements.editDialog.replaceImage" : "announcements.addImage")}</Label>
            <Input id={imageInputId} type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={(event) => { chooseFile(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
            {imageAction !== "keep" && <Button type="button" variant="ghost" disabled={pending} onClick={() => { setFile(null); setImageAction("keep"); setError(null); }}><RotateCcwIcon aria-hidden="true" />{t("announcements.editDialog.restoreImage")}</Button>}
          </div>
          <span className="field-hint">{t("announcements.imageHint")}</span>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>{t("actions.cancel")}</DialogClose>
          <Button type="submit" disabled={pending}>{pending ? t("announcements.editDialog.saving") : t("announcements.editDialog.save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
