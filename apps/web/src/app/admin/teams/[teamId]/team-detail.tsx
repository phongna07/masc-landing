"use client";

import { TEAM_SIZE } from "@masc-landing/api/registration";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, CheckIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminLoading, formatBirthdate, formatDate } from "../../admin-state";

type DecisionStatus = "approved" | "rejected";
const mailFilters = ["pending", "failed", "sent", "all"] as const;

export default function TeamDetail({ teamId }: { teamId: string }) {
  const t = useTranslations("Admin");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const router = useRouter();
  const team = useQuery(trpc.admin.getTeam.queryOptions({ teamId }));
  const [statusToConfirm, setStatusToConfirm] = useState<DecisionStatus | null>(null);
  const updateStatus = useMutation(trpc.admin.updateTeamStatus.mutationOptions({
    onSuccess: async (result) => {
      setStatusToConfirm(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.admin.getTeam.queryKey({ teamId }) }),
        queryClient.invalidateQueries({ queryKey: trpc.admin.listTeams.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.admin.getTeamStats.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.admin.getMailStats.queryKey() }),
        ...mailFilters.map((status) => queryClient.invalidateQueries({
          queryKey: trpc.admin.listMail.queryKey({ status }),
        })),
      ]);
      if (result.queuedMailCount > 0) {
        toast.success(t("teams.mailQueued", { count: result.queuedMailCount }), {
          action: { label: t("teams.openMail"), onClick: () => router.push("/admin/mail") },
        });
      } else {
        toast.success(t("teams.statusUpdateSuccess"));
      }
    },
    onError: () => toast.error(t("teams.statusUpdateError")),
  }));

  if (team.isPending) return <AdminLoading />;
  if (team.isError) {
    if (team.error.data?.code === "NOT_FOUND") return <AdminEmpty title={t("detail.notFoundTitle")} description={t("detail.notFoundDescription")} />;
    return <AdminError title={t("errors.loadTitle")} description={t("errors.detail")} retry={() => team.refetch()} retryLabel={t("actions.retry")} />;
  }
  const awarenessSource = team.data.awarenessSource
    ? `${t(`values.awarenessSource.${team.data.awarenessSource}`)}${team.data.awarenessSourceDetail ? ` — ${team.data.awarenessSourceDetail}` : ""}`
    : t("values.notProvided");

  return <>
    <Link className="admin-back-link" href="/admin/teams"><ArrowLeftIcon aria-hidden="true" />{t("actions.backToTeams")}</Link>
    <div className="admin-detail-heading">
      <div><p>{t("detail.eyebrow")}</p><h1>{team.data.name}</h1></div>
      <span className={`status-badge status-${team.data.status}`}>{t(`values.status.${team.data.status}`)}</span>
    </div>
    <div className="admin-detail-grid">
      <Card className="dashboard-card"><CardHeader><CardTitle>{t("detail.registration")}</CardTitle></CardHeader><CardContent className="detail-list">
        <Detail label={t("fields.created")} value={formatDate(team.data.createdAt, locale)} />
        <Detail label={t("fields.members")} value={t("values.memberCount", { count: team.data.members.length, required: TEAM_SIZE })} />
        <Detail label={t("fields.awarenessSource")} value={awarenessSource} />
        <div className="admin-status-editor">
          <span className="admin-status-label">{t("fields.status")}</span>
          <div className="admin-status-editor-controls">
            <span className={`status-badge status-${team.data.status}`}>{t(`values.status.${team.data.status}`)}</span>
            <div className="admin-status-actions">
              {team.data.status !== "approved" && <Button type="button" size="sm" disabled={updateStatus.isPending}
                onClick={() => setStatusToConfirm("approved")}><CheckIcon aria-hidden="true" />
                {t(team.data.status === "rejected" ? "teams.changeToApprove" : "teams.approve")}</Button>}
              {team.data.status !== "rejected" && <Button type="button" size="sm" variant="destructive"
                disabled={updateStatus.isPending} onClick={() => setStatusToConfirm("rejected")}>
                <XIcon aria-hidden="true" />
                {t(team.data.status === "approved" ? "teams.changeToReject" : "teams.reject")}</Button>}
            </div>
            {updateStatus.isPending && <span>{t("teams.statusUpdating")}</span>}
          </div>
        </div>
      </CardContent></Card>
      <Card className="dashboard-card"><CardHeader><CardTitle>{t("detail.captainContact")}</CardTitle></CardHeader><CardContent className="detail-list">
        <Detail label={t("fields.name")} value={team.data.captainName} />
        <Detail label={t("fields.email")} value={team.data.captainEmail} />
        <Detail label={t("fields.phone")} value={team.data.captainPhone} />
      </CardContent></Card>
    </div>
    <Card className="admin-table-card"><CardHeader><CardTitle>{t("detail.roster")}</CardTitle></CardHeader><CardContent className="admin-table-scroll">
      <table className="admin-table"><thead><tr><th scope="col">{t("fields.member")}</th><th scope="col">{t("fields.email")}</th><th scope="col">{t("fields.birthdate")}</th><th scope="col">{t("fields.university")}</th><th scope="col">{t("fields.role")}</th></tr></thead>
        <tbody>{team.data.members.map((member) => <tr key={member.id}><td><strong>{member.fullName}</strong></td><td>{member.email}</td><td>{formatBirthdate(member.birthdate, locale)}</td><td>{member.universityName}</td><td>{member.isCaptain && <span className="captain-tag">{t("values.captain")}</span>}</td></tr>)}</tbody>
      </table>
    </CardContent></Card>
    <StatusConfirmationDialog status={statusToConfirm} teamName={team.data.name} pending={updateStatus.isPending}
      onCancel={() => setStatusToConfirm(null)}
      onConfirm={(status) => updateStatus.mutate({ teamId, status })} />
    <Button className="admin-mobile-back" variant="outline" nativeButton={false} render={<Link href="/admin/teams" />}><ArrowLeftIcon aria-hidden="true" />{t("actions.backToTeams")}</Button>
  </>;
}

function StatusConfirmationDialog({ status, teamName, pending, onCancel, onConfirm }: {
  status: DecisionStatus | null;
  teamName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (status: DecisionStatus) => void;
}) {
  const t = useTranslations("Admin");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (status && !dialog.open) dialog.showModal();
    if (!status && dialog.open) dialog.close();
  }, [status]);

  const close = () => {
    if (!pending) onCancel();
  };

  return <dialog className="status-confirmation-dialog" ref={dialogRef} aria-labelledby="status-confirmation-title"
    aria-describedby="status-confirmation-description" onClose={close}
    onCancel={(event) => { if (pending) event.preventDefault(); else onCancel(); }}>
    {status && <div className="status-confirmation-content">
      <span className={`status-confirmation-icon status-confirmation-icon-${status}`} aria-hidden="true">
        {status === "approved" ? <CheckIcon /> : <XIcon />}
      </span>
      <h2 id="status-confirmation-title">{t(`teams.confirmation.${status}.title`)}</h2>
      <p id="status-confirmation-description">{t(`teams.confirmation.${status}.description`, { team: teamName })}</p>
      <div className="status-confirmation-actions">
        <Button type="button" variant="outline" disabled={pending} autoFocus onClick={onCancel}>{t("actions.cancel")}</Button>
        <Button type="button" variant={status === "rejected" ? "destructive" : "default"} disabled={pending}
          onClick={() => onConfirm(status)}>{pending ? t("teams.statusUpdating") : t(`teams.confirmation.${status}.confirm`)}</Button>
      </div>
    </div>}
  </dialog>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
