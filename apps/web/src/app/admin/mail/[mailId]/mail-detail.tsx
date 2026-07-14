"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, RefreshCwIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminLoading, formatDate } from "../../admin-state";

const filters = ["pending", "failed", "sent", "all"] as const;

export default function MailDetail({ mailId }: { mailId: string }) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const mail = useQuery(trpc.admin.getMail.queryOptions({ mailId }));
  const sendMail = useMutation(trpc.admin.sendMail.mutationOptions({
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.admin.getMail.queryKey({ mailId }) }),
        ...filters.map((status) => queryClient.invalidateQueries({ queryKey: trpc.admin.listMail.queryKey({ status }) })),
      ]);
      toast.success(t("mail.sendSuccess"));
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.admin.getMail.queryKey({ mailId }) });
      toast.error(t("mail.sendError"));
    },
  }));

  if (mail.isPending) return <AdminLoading />;
  if (mail.isError) {
    if (mail.error.data?.code === "NOT_FOUND") return <AdminEmpty title={t("mail.notFoundTitle")} description={t("mail.notFoundDescription")} />;
    return <AdminError title={t("errors.loadTitle")} description={t("errors.mailDetail")} retry={() => mail.refetch()} retryLabel={t("actions.retry")} />;
  }

  const canSend = mail.data.status === "pending" || mail.data.status === "failed";
  return <>
    <Link className="admin-back-link" href="/admin/mail"><ArrowLeftIcon aria-hidden="true" />{t("mail.back")}</Link>
    <div className="admin-detail-heading mail-detail-heading">
      <div><p>{t("mail.detailEyebrow")}</p><h1>{mail.data.memberName}</h1><span>{mail.data.toAddress}</span></div>
      {canSend && <Button type="button" disabled={sendMail.isPending} onClick={() => sendMail.mutate({ mailId })}>
        {mail.data.status === "failed" ? <RefreshCwIcon aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
        {sendMail.isPending ? t("mail.sending") : t(mail.data.status === "failed" ? "mail.retry" : "mail.send")}
      </Button>}
    </div>
    <Card className="mail-metadata"><CardContent className="detail-list">
      <Detail label={t("fields.from")} value={mail.data.fromAddress} />
      <Detail label={t("fields.recipient")} value={mail.data.toAddress} />
      <Detail label={t("fields.subject")} value={mail.data.subject} />
      <Detail label={t("fields.team")} value={mail.data.teamName} />
      <Detail label={t("fields.status")} value={t(`mail.status.${mail.data.status}`)} />
      <Detail label={t("mail.attempts")} value={String(mail.data.attemptCount)} />
      <Detail label={t("fields.created")} value={formatDate(mail.data.createdAt, locale)} />
      {mail.data.lastAttemptedAt && <Detail label={t("mail.lastAttempt")} value={formatDate(mail.data.lastAttemptedAt, locale)} />}
      {mail.data.sentAt && <Detail label={t("mail.sentAt")} value={formatDate(mail.data.sentAt, locale)} />}
      {mail.data.errorMessage && <Detail label={t("mail.failure")} value={mail.data.errorMessage} />}
    </CardContent></Card>
    <Card className="mail-preview-card"><CardHeader><CardTitle>{t("mail.htmlPreview")}</CardTitle></CardHeader>
      <CardContent><iframe title={t("mail.previewTitle", { recipient: mail.data.toAddress })} sandbox="" srcDoc={mail.data.html} /></CardContent></Card>
    <Card className="mail-text-card"><CardHeader><CardTitle>{t("mail.textPreview")}</CardTitle></CardHeader>
      <CardContent><pre>{mail.data.text}</pre></CardContent></Card>
  </>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
