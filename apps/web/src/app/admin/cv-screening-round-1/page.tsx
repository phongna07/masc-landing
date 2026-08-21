"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { ConfirmationDialog } from "@masc-landing/ui/components/confirmation-dialog";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@masc-landing/ui/components/dialog";
import { Skeleton } from "@masc-landing/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckIcon, DownloadIcon, EyeIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { queryClient, trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, AdminMetrics, formatDate } from "../admin-state";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export default function CvScreeningRoundOnePage() {
	const t = useTranslations("Admin");
	const locale = useLocale();
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [selectedTracks, setSelectedTracks] = useState<Record<string, string>>({});
	const [preview, setPreview] = useState<{ url: string; memberName: string; filename: string } | null>(null);
	const teams = useQuery(trpc.admin.listRoundOneCvScreeningTeams.queryOptions());
	const stats = useQuery(trpc.admin.getRoundOneCvScreeningStats.queryOptions());
	const refresh = () => Promise.all([
		queryClient.invalidateQueries({ queryKey: trpc.admin.listRoundOneCvScreeningTeams.queryKey() }),
		queryClient.invalidateQueries({ queryKey: trpc.admin.getRoundOneCvScreeningStats.queryKey() }),
	]);
	const decide = useMutation(trpc.admin.decideRoundOneCvScreeningTeam.mutationOptions({
		onSuccess: async () => { await refresh(); toast.success(t("screening.decisionSuccess")); },
		onError: async () => { await refresh(); toast.error(t("screening.conflict")); },
	}));
	const assign = useMutation(trpc.admin.assignRoundOneTrack.mutationOptions({
		onSuccess: async () => { await refresh(); toast.success(t("screening.assignmentSuccess")); },
		onError: async () => { await refresh(); toast.error(t("screening.conflict")); },
	}));
	const cvUrl = useMutation(trpc.admin.createRoundOneScreeningCvUrl.mutationOptions({
		onError: () => toast.error(t("teams.cvError")),
	}));
	const previewCv = async (teamId: string, memberId: string, memberName: string, filename: string) => {
		try {
			const { url } = await cvUrl.mutateAsync({ teamId, memberId, disposition: "inline" });
			setPreview({ url, memberName, filename });
		} catch { /* mutation callback shows the localized error */ }
	};
	const downloadCv = async (teamId: string, memberId: string) => {
		try {
			const { url } = await cvUrl.mutateAsync({ teamId, memberId, disposition: "attachment" });
			window.open(url, "_blank", "noopener,noreferrer");
		} catch { /* mutation callback shows the localized error */ }
	};
	const visible = teams.data?.filter((team) => statusFilter === "all" || team.registrationStatus === statusFilter) ?? [];
	return <>
		<AdminHeading eyebrow={t("eyebrow")} title={t("screening.title")} description={t("screening.description")} />
		<AdminMetrics label={t("screening.summaryLabel")} isPending={stats.isPending} isError={stats.isError}
			errorLabel={t("stats.error")} retry={() => stats.refetch()} retryLabel={t("actions.retry")} locale={locale} metrics={[
				{ label: t("stats.totalTeams"), value: stats.data?.totalTeams },
				{ label: t("screening.stats.waitingForPreferences"), value: stats.data?.waitingForPreferences },
				{ label: t("screening.stats.pendingScreening"), value: stats.data?.pendingScreening },
				{ label: t("stats.approvedTeams"), value: stats.data?.approvedTeams },
				{ label: t("stats.rejectedTeams"), value: stats.data?.rejectedTeams },
				{ label: t("screening.stats.assignedTeams"), value: stats.data?.assignedTeams },
			]} />
		{stats.isPending ? <TrackDistributionSkeleton /> : stats.data
			? <TrackDistribution tracks={stats.data.trackAssignments} locale={locale} /> : null}
		<div className="admin-team-toolbar screening-toolbar">
			<div className="admin-status-actions admin-status-filter" role="group" aria-label={t("teams.statusFilter")}>
				{(["all", "pending", "approved", "rejected"] as const).map((status) => <Button key={status}
					aria-pressed={statusFilter === status} className="admin-status-filter-button" data-status={status}
					size="sm" variant="ghost" onClick={() => setStatusFilter(status)}>
					{status === "all" ? t("teams.filterAll") : t(`values.status.${status}`)}</Button>)}
			</div>
			<Button variant="outline" onClick={() => Promise.all([teams.refetch(), stats.refetch()])}
				disabled={teams.isFetching || stats.isFetching}>
				<RefreshCwIcon />{t("actions.retry")}
			</Button>
		</div>
		{teams.isPending ? <AdminLoading /> : teams.isError ? <AdminError title={t("errors.loadTitle")}
			description={t("screening.loadError")} retry={() => teams.refetch()} retryLabel={t("actions.retry")} />
			: teams.data.length === 0 ? <AdminEmpty title={t("screening.emptyTitle")} description={t("screening.emptyDescription")} />
				: <Card className="admin-table-card"><CardContent className="admin-table-scroll">
					<table className="admin-table screening-table"><thead><tr>
						<th>{t("fields.team")}</th><th>{t("teams.admissionMethod")}</th>
						<th>{t("fields.status")}</th><th>{t("fields.preferenceStatus")}</th>
						<th>{t("fields.preferences")}</th><th>{t("fields.assignedTrack")}</th>
						<th>{t("teams.cv")}</th><th>{t("fields.created")}</th><th>{t("screening.actions")}</th>
					</tr></thead><tbody>{visible.map((team) => {
						const selectedTrack = selectedTracks[team.id] ?? team.assignedTrack?.id ?? "";
						const canChoose = team.preferenceStatus === "submitted" || team.preferenceStatus === "assigned";
						const canApprove = team.admissionMethod === "cv_screening" && team.registrationStatus === "pending"
							&& team.preferenceStatus === "submitted" && !!selectedTrack;
						const canAssign = team.registrationStatus === "approved" && canChoose && !!selectedTrack
							&& selectedTrack !== team.assignedTrack?.id;
						return <tr key={team.id}>
							<td><strong>{team.name}</strong><span>{team.captainName}</span><span>{team.captainEmail}</span></td>
							<td>{t(`teams.admissionMethods.${team.admissionMethod}`)}</td>
							<td><span className={`status-badge status-${team.registrationStatus}`}>{t(`values.status.${team.registrationStatus}`)}</span></td>
							<td><PreferenceStatus status={team.preferenceStatus} /></td>
							<td><PreferenceList preferences={team.preferences} /></td>
							<td>{team.assignedTrack?.name ?? "—"}</td>
							<td>{team.admissionMethod === "cv_screening" ? <div className="screening-cvs">
								{team.members.map((member) => <div key={member.id}><span>{member.fullName}</span>
									{member.cvFilename ? <div className="admin-status-actions">
										<Button size="sm" variant="outline" disabled={cvUrl.isPending}
											onClick={() => previewCv(team.id, member.id, member.fullName, member.cvFilename!)}><EyeIcon />{t("teams.previewCv")}</Button>
										<Button size="sm" variant="outline" disabled={cvUrl.isPending}
											onClick={() => downloadCv(team.id, member.id)}><DownloadIcon />{t("teams.downloadCv")}</Button>
									</div> : <span>—</span>}</div>)}
							</div> : t("values.notApplicable")}</td>
							<td>{formatDate(team.readyAt, locale)}</td>
							<td><div className="screening-actions">
								{canChoose && <select className="admin-track-select" value={selectedTrack}
									onChange={(event) => setSelectedTracks((current) => ({ ...current, [team.id]: event.target.value }))}>
									<option value="">{t("screening.selectTrack")}</option>
									{team.preferences.map((preference) => <option key={preference.id} value={preference.id}>{preference.name}</option>)}
								</select>}
								{team.registrationStatus === "pending" && team.admissionMethod === "cv_screening" && <>
									<ConfirmationDialog trigger={<Button disabled={!canApprove || decide.isPending}><CheckIcon />{t("teams.approve")}</Button>}
										title={t("screening.approveTitle")} description={t("screening.approveDescription", { team: team.name })}
										confirmLabel={t("teams.approve")} cancelLabel={t("actions.cancel")} icon={<CheckIcon />} tone="success"
										onConfirm={() => decide.mutate({ teamId: team.id, status: "approved", trackId: selectedTrack })} />
									<ConfirmationDialog trigger={<Button variant="destructive" disabled={team.preferenceStatus !== "submitted" || decide.isPending}><XIcon />{t("teams.reject")}</Button>}
										title={t("screening.rejectTitle")} description={t("screening.rejectDescription", { team: team.name })}
										confirmLabel={t("teams.reject")} cancelLabel={t("actions.cancel")} icon={<XIcon />} tone="destructive"
										onConfirm={() => decide.mutate({ teamId: team.id, status: "rejected" })} />
								</>}
								{team.registrationStatus === "approved" && canChoose && <Button disabled={!canAssign || assign.isPending}
									onClick={() => assign.mutate({ teamId: team.id, trackId: selectedTrack })}>
									{team.preferenceStatus === "assigned" ? t("screening.reassign") : t("screening.assign")}</Button>}
								{team.preferenceStatus === "not_submitted" && <span>{t("screening.waitingPreferences")}</span>}
								{team.registrationStatus === "rejected" && <span>{t("screening.finalDecision")}</span>}
							</div></td>
						</tr>;
					})}</tbody></table>
			</CardContent></Card>}
		<Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null); }}>
			<DialogContent className="screening-cv-dialog">
				<DialogHeader className="screening-cv-dialog-header">
					<DialogTitle>{t("screening.previewTitle", { name: preview?.memberName ?? "" })}</DialogTitle>
					<DialogDescription>{preview?.filename}</DialogDescription>
				</DialogHeader>
				<DialogClose className="screening-cv-dialog-close"
					render={<Button type="button" variant="ghost" size="icon" aria-label={t("actions.close")} />}>
					<XIcon aria-hidden="true" />
				</DialogClose>
				{preview && <iframe className="screening-cv-preview" src={preview.url}
					title={t("screening.previewFrameTitle", { filename: preview.filename })} />}
			</DialogContent>
		</Dialog>
	</>;
}

function PreferenceStatus({ status }: { status: "not_submitted" | "submitted" | "assigned" }) {
	const t = useTranslations("Admin");
	return <span className={`preference-status preference-status-${status}`}>{t(`values.preferenceStatus.${status}`)}</span>;
}

function PreferenceList({ preferences }: { preferences: { id: string; name: string }[] }) {
	return preferences.length ? <ol className="admin-preference-list">{preferences.map((preference, index) =>
		<li key={preference.id}>{index + 1}{`) `}{preference.name}</li>)}</ol> : <>—</>;
}

function TrackDistribution({ tracks, locale }: {
	tracks: { trackId: string; trackName: string; assignedTeams: number }[];
	locale: string;
}) {
	const t = useTranslations("Admin");
	const totalAssignments = tracks.reduce((total, track) => total + track.assignedTeams, 0);
	const numberFormatter = new Intl.NumberFormat(locale);
	const percentageFormatter = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
	const tracksWithShares = tracks.map((track) => ({
		...track,
		share: totalAssignments === 0 ? 1 / tracks.length : track.assignedTeams / totalAssignments,
	}));
	const summary = tracksWithShares.map((track) => `${track.trackName}: ${numberFormatter.format(track.assignedTeams)}, ${percentageFormatter.format(track.share)}`).join("; ");

	return <Card className="screening-track-distribution">
		<CardHeader className="screening-track-distribution-header">
			<CardTitle id="screening-track-distribution-title">{t("screening.trackDistribution.title")}</CardTitle>
			<p>{t("screening.trackDistribution.description")}</p>
		</CardHeader>
		<CardContent>
			{tracks.length === 0 ? <p className="screening-track-unavailable">{t("screening.trackDistribution.unavailable")}</p> : <>
				<div className="screening-track-bar" role="img"
					aria-label={t("screening.trackDistribution.ariaLabel", { summary })}>
					{tracksWithShares.map((track, index) => <span aria-hidden="true" className="screening-track-segment"
						data-color={index % 5} key={track.trackId} style={{ width: `${track.share * 100}%` }} />)}
				</div>
				<ul className="screening-track-legend" aria-labelledby="screening-track-distribution-title">
					{tracksWithShares.map((track, index) => <li key={track.trackId}>
						<span aria-hidden="true" className="screening-track-marker" data-color={index % 5} />
						<span className="screening-track-legend-copy"><strong>{track.trackName}</strong>
							<span>{t("screening.trackDistribution.teamCount", { count: track.assignedTeams })}</span></span>
						<span className="screening-track-percentage">{percentageFormatter.format(track.share)}</span>
					</li>)}
				</ul>
				{totalAssignments === 0 && <p className="screening-track-zero-note">{t("screening.trackDistribution.zeroAssignments")}</p>}
			</>}
		</CardContent>
	</Card>;
}

function TrackDistributionSkeleton() {
	return <Card className="screening-track-distribution" aria-hidden="true">
		<CardHeader className="screening-track-distribution-header">
			<Skeleton className="screening-track-title-skeleton" />
			<Skeleton className="screening-track-copy-skeleton" />
		</CardHeader>
		<CardContent><Skeleton className="screening-track-bar-skeleton" />
			<div className="screening-track-legend-skeleton"><Skeleton /><Skeleton /><Skeleton /></div>
		</CardContent>
	</Card>;
}
