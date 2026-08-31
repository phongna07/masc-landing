"use client";

import type { RoundId } from "@masc-landing/api/rounds";
import { TEAM_SIZE } from "@masc-landing/api/registration";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { ConfirmationDialog } from "@masc-landing/ui/components/confirmation-dialog";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, ArrowUpRightIcon, CheckIcon, DownloadIcon, EyeIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRoundLabel } from "@/hooks/use-round-label";
import { queryClient, trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminLoading, formatBirthdate, formatDate } from "../admin-state";

const targets: Record<RoundId, RoundId[]> = { "0.5": ["1", "2"], "1": ["2"], "2": ["3"], "3": [] };

export default function RoundTeamDetail({ round, teamId }: { round: RoundId; teamId: string }) {
  const t = useTranslations("Admin"); const locale = useLocale();
  const roundLabel = useRoundLabel();
  const input = { round, teamId };
  const team = useQuery(trpc.admin.getTeam.queryOptions(input));
  const update = useMutation(trpc.admin.updateTeamStatus.mutationOptions({ onSuccess: async () => {
    toast.success(t("teams.statusUpdateSuccess"));
    await Promise.all([queryClient.invalidateQueries({ queryKey: trpc.admin.getTeam.queryKey(input) }),
      queryClient.invalidateQueries({ queryKey: trpc.admin.listTeams.queryKey({ round }) }),
      queryClient.invalidateQueries({ queryKey: trpc.admin.getTeamStats.queryKey({ round }) })]);
  }, onError: () => toast.error(t("teams.statusUpdateError")) }));
  const promote = useMutation(trpc.admin.promoteTeams.mutationOptions({ onSuccess: ({ results }) => {
    const result = results[0]; toast[result?.success ? "success" : "error"](result?.success ? t("teams.promotionSuccess") : t("teams.promotionError"),
      { description: result && !result.success && result.conflictingEmails.length ? t("teams.promotionConflicts", { emails: result.conflictingEmails.join(", ") }) : undefined });
  }, onError: () => toast.error(t("teams.promotionError")) }));
  const cvUrl = useMutation(trpc.admin.createTeamCvUrl.mutationOptions({ onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: () => toast.error(t("teams.cvError")) }));
  if (team.isPending) return <AdminLoading />;
  if (team.isError) return team.error.data?.code === "NOT_FOUND" ? <AdminEmpty title={t("detail.notFoundTitle")} description={t("detail.notFoundDescription")} />
    : <AdminError title={t("errors.loadTitle")} description={t("errors.detail")} retry={() => team.refetch()} retryLabel={t("actions.retry")} />;
  const decide = (status: "approved" | "rejected") => {
    update.mutate({ ...input, status });
  };
  const runPromotion = (targetRound: RoundId) => {
    if (round === "0.5" && (targetRound === "1" || targetRound === "2")) promote.mutate({ sourceRound: round, targetRound, teamIds: [teamId] });
    else if (round === "1" && targetRound === "2") promote.mutate({ sourceRound: round, targetRound, teamIds: [teamId] });
    else if (round === "2" && targetRound === "3") promote.mutate({ sourceRound: round, targetRound, teamIds: [teamId] });
  };
  const captain = team.data.members.find((member) => member.isCaptain);
  return <><Link className="admin-back-link" href={`/admin/teams/round-${round}`}><ArrowLeftIcon />{t("actions.backToTeams")}</Link>
    <div className="admin-detail-heading"><div><p>{t("teams.roundTitle", { roundLabel: roundLabel(round) })}</p><h1>{team.data.name}</h1></div>
      <span className={`status-badge status-${team.data.status}`}>{t(`values.status.${team.data.status}`)}</span></div>
    <div className="admin-status-actions">
      {round !== "1" && team.data.status !== "approved" && <ConfirmationDialog
        trigger={<Button disabled={update.isPending}><CheckIcon />{t("teams.approve")}</Button>}
        title={t("teams.confirmation.approved.title")}
        description={t("teams.confirmation.approved.description", { team: team.data.name })}
        confirmLabel={t("teams.confirmation.approved.confirm")}
        cancelLabel={t("actions.cancel")}
        icon={<CheckIcon />}
        tone="success"
        onConfirm={() => decide("approved")}
      />}
      {round !== "1" && team.data.status !== "rejected" && <ConfirmationDialog
        trigger={<Button variant="destructive" disabled={update.isPending}><XIcon />{t("teams.reject")}</Button>}
        title={t("teams.confirmation.rejected.title")}
        description={t("teams.confirmation.rejected.description", { team: team.data.name })}
        confirmLabel={t("teams.confirmation.rejected.confirm")}
        cancelLabel={t("actions.cancel")}
        icon={<XIcon />}
        tone="destructive"
        onConfirm={() => decide("rejected")}
      />}
      {team.data.status === "approved" && !team.data.isEliminated && targets[round].map((targetRound) => <ConfirmationDialog
        key={targetRound}
        trigger={<Button variant="outline" disabled={promote.isPending}>{t("teams.promoteTo", { roundLabel: roundLabel(targetRound) })}</Button>}
        title={t("teams.promotionConfirmation.title", { count: 1, roundLabel: roundLabel(targetRound) })}
        description={t("teams.promotionConfirmation.description", { count: 1, roundLabel: roundLabel(targetRound) })}
        confirmLabel={t("teams.promotionConfirmation.confirm", { count: 1 })}
        cancelLabel={t("actions.cancel")}
        icon={<ArrowUpRightIcon />}
        onConfirm={() => runPromotion(targetRound)}
      />)}
    </div>
    <div className="admin-detail-grid"><Card className="dashboard-card"><CardHeader><CardTitle>{t("detail.registration")}</CardTitle></CardHeader><CardContent className="detail-list">
      <Detail label={t("fields.created")} value={formatDate(team.data.createdAt, locale)} /><Detail label={t("fields.members")} value={t("values.memberCount", { count: team.data.members.length, required: TEAM_SIZE })} />
      <Detail label={t("fields.isEliminated")} value={t(`values.boolean.${team.data.isEliminated}`)} />
      <Detail label={t("teams.admissionMethod")} value={t(`teams.admissionMethods.${team.data.admissionMethod}`)} />
      {round === "1" && <><Detail label={t("fields.preferenceStatus")} value={team.data.preferenceStatus
        ? t(`values.preferenceStatus.${team.data.preferenceStatus}`) : "—"} />
        <Detail label={t("fields.preferences")} value={team.data.preferences.map((preference, index) => `${index + 1}. ${preference.name}`).join(" · ") || "—"} />
        <Detail label={t("fields.assignedTrack")} value={team.data.assignedTrack?.name ?? "—"} /></>}
      </CardContent></Card>
      <Card className="dashboard-card"><CardHeader><CardTitle>{t("detail.captainContact")}</CardTitle></CardHeader><CardContent className="detail-list">
        <Detail label={t("fields.name")} value={team.data.captainName} /><Detail label={t("fields.email")} value={team.data.captainEmail} /><Detail label={t("fields.phone")} value={team.data.captainPhone} />
        {round === "1" && <Detail label={t("fields.facebookProfile")} value={captain?.facebookProfileUrl
          ? <FacebookLink url={captain.facebookProfileUrl} /> : "—"} />}
      </CardContent></Card></div>
    <Card className="admin-table-card"><CardHeader><CardTitle>{t("detail.roster")}</CardTitle></CardHeader><CardContent className="admin-table-scroll"><table className="admin-table">
      <thead><tr><th>{t("fields.member")}</th><th>{t("fields.email")}</th><th>{t("fields.birthdate")}</th><th>{t("fields.university")}</th>
        {round === "1" && <><th>{t("fields.phone")}</th><th>{t("fields.facebookProfile")}</th></>}<th>{t("fields.role")}</th><th>{t("teams.cv")}</th></tr></thead>
      <tbody>{team.data.members.map((member) => <tr key={member.id}><td><strong>{member.fullName}</strong></td><td>{member.email}</td><td>{formatBirthdate(member.birthdate, locale)}</td>
        <td>{member.universityName}</td>{round === "1" && <><td>{member.phone ?? "—"}</td><td>{member.facebookProfileUrl
          ? <FacebookLink url={member.facebookProfileUrl} /> : "—"}</td></>}<td>{member.isCaptain && <span className="captain-tag">{t("values.captain")}</span>}</td><td>{member.cv && <div className="admin-status-actions">
          <Button size="sm" variant="outline" onClick={() => cvUrl.mutate({ teamId, memberId: member.id, disposition: "inline" })}><EyeIcon />{t("teams.previewCv")}</Button>
          <Button size="sm" variant="outline" onClick={() => cvUrl.mutate({ teamId, memberId: member.id, disposition: "attachment" })}><DownloadIcon />{t("teams.downloadCv")}</Button></div>}</td></tr>)}</tbody>
    </table></CardContent></Card>
  </>;
}

function FacebookLink({ url }: { url: string }) {
  return <a className="facebook-profile-link" href={url} target="_blank" rel="noopener noreferrer" title={url}>{url}</a>;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
