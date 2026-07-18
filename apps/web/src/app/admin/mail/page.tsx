"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon, RefreshCwIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, formatDate } from "../admin-state";

const filters = ["pending", "failed", "sent", "all"] as const;
type MailFilter = (typeof filters)[number];

export default function AdminMailPage() {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<MailFilter>("pending");
  const mail = useQuery(trpc.admin.listMail.queryOptions({ status }));
  const sendMail = useMutation(trpc.admin.sendMail.mutationOptions({
    onSuccess: async (_, input) => {
      await Promise.all(filters.map((filter) => queryClient.invalidateQueries({
        queryKey: trpc.admin.listMail.queryKey({ status: filter }),
      })));
      await queryClient.invalidateQueries({ queryKey: trpc.admin.getMail.queryKey({ mailId: input.mailId }) });
      toast.success(t("mail.sendSuccess"));
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.admin.listMail.queryKey({ status }) });
      toast.error(t("mail.sendError"));
    },
  }));

  return <>
    <AdminHeading eyebrow={t("eyebrow")} title={t("mail.title")} description={t("mail.description")} />
    <div className="mail-filters" role="group" aria-label={t("mail.filterLabel")}>
      {filters.map((filter) => <Button key={filter} type="button" variant={status === filter ? "default" : "outline"}
        onClick={() => setStatus(filter)}>{t(`mail.filters.${filter}`)}</Button>)}
    </div>
    {mail.isPending ? <AdminLoading /> : mail.isError ? (
      <AdminError title={t("errors.loadTitle")} description={t("errors.mail")} retry={() => mail.refetch()} retryLabel={t("actions.retry")} />
    ) : mail.data.length === 0 ? (
      <AdminEmpty title={t("mail.emptyTitle")} description={t("mail.emptyDescription")} />
    ) : (
      <Card className="admin-table-card"><CardContent className="admin-table-scroll">
        <table className="admin-table admin-mail-table">
          <thead><tr><th scope="col">{t("fields.recipient")}</th><th scope="col">{t("fields.team")}</th>
            <th scope="col">{t("fields.subject")}</th><th scope="col">{t("fields.status")}</th>
            <th scope="col">{t("fields.created")}</th><th scope="col"><span className="sr-only">{t("mail.actions")}</span></th></tr></thead>
          <tbody>{mail.data.map((item) => {
            const canSend = item.status === "pending" || item.status === "failed";
            const isSending = sendMail.isPending && sendMail.variables?.mailId === item.id;
            return <tr key={item.id}>
              <td className="mail-recipients">
                <strong>{t("fields.to")}: {item.memberName}</strong>
                <span>{item.toAddress}</span>
                <span><b>{t("fields.cc")}:</b> {item.cc.join(", ")}</span>
              </td>
              <td>{item.teamName}</td>
              <td><Link className="admin-row-link" href={`/admin/mail/${item.id}`}><strong>{item.subject}</strong></Link></td>
              <td><span className={`mail-status mail-status-${item.status}`}>{t(`mail.status.${item.status}`)}</span></td>
              <td>{formatDate(item.createdAt, locale)}</td>
              <td><div className="mail-row-actions">
                {canSend && <Button type="button" size="sm" disabled={sendMail.isPending}
                  onClick={() => sendMail.mutate({ mailId: item.id })}>
                  {item.status === "failed" ? <RefreshCwIcon aria-hidden="true" /> : <SendIcon aria-hidden="true" />}
                  {isSending ? t("mail.sending") : t(item.status === "failed" ? "mail.retry" : "mail.send")}
                </Button>}
                <Link className="admin-view-link" href={`/admin/mail/${item.id}`} aria-label={t("mail.previewFor", { recipient: item.toAddress })}>
                  <ChevronRightIcon aria-hidden="true" />
                </Link>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </CardContent></Card>
    )}
  </>;
}
