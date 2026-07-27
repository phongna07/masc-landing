"use client";

import { Button } from "@masc-landing/ui/components/button";
import { roundIds } from "@masc-landing/api/rounds";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

import { AdminError, AdminHeading, AdminLoading } from "../admin-state";

export default function AdminPage() {
	const t = useTranslations("Admin");
	const settings = useQuery(trpc.admin.getSubmissionSettings.queryOptions());
	const tabSettings = useQuery(trpc.admin.getDashboardTabSettings.queryOptions());
	const admissionSettings = useQuery(trpc.admin.getAdmissionSettings.queryOptions());
	const update = useMutation(trpc.admin.setRoundSubmissionOpen.mutationOptions({
		onSuccess: async (data) => {
			settings.refetch();
			toast.success(t("overview.success"));
			return data;
		},
		onError: () => toast.error(t("overview.error")),
	}));
	const updateTab = useMutation(trpc.admin.setRoundTabVisible.mutationOptions({
		onSuccess: async (data) => {
			await tabSettings.refetch();
			toast.success(t("overview.tabSuccess"));
			return data;
		},
		onError: () => toast.error(t("overview.tabError")),
	}));
	const updateAdmission = useMutation(trpc.admin.setRoundAdmissionOpen.mutationOptions({
		onSuccess: async () => { await admissionSettings.refetch(); toast.success(t("overview.admissionSuccess")); },
		onError: () => toast.error(t("overview.admissionError")),
	}));

	return <>
		<AdminHeading eyebrow={t("eyebrow")} title={t("overview.title")} description={t("overview.description")} />
		<section className="admin-setting-section" aria-labelledby="admission-settings-title">
			<div className="admin-setting-section-heading"><h2 id="admission-settings-title">{t("overview.admissionSectionTitle")}</h2>
				<p>{t("overview.admissionSectionDescription")}</p></div>
			{admissionSettings.isPending ? <AdminLoading /> : admissionSettings.isError ?
				<AdminError title={t("errors.loadTitle")} description={t("overview.admissionLoadError")} retry={() => admissionSettings.refetch()} retryLabel={t("actions.retry")} /> :
				<div className="admin-round-settings">{(["0.5", "1"] as const).map((round) => { const isOpen = admissionSettings.data[round]; return <Card className="admin-round-setting" key={round}>
					<CardHeader><div><CardTitle>{t("overview.roundTitle", { round })}</CardTitle><p>{t("overview.admissionRoundDescription", { round })}</p></div>
						<span className={isOpen ? "is-open" : "is-closed"}>{t(isOpen ? "overview.open" : "overview.closed")}</span></CardHeader>
					<CardContent><Button role="switch" aria-checked={isOpen} disabled={updateAdmission.isPending}
						onClick={() => updateAdmission.mutate({ round, isOpen: !isOpen })}>{t(isOpen ? "overview.closeAdmission" : "overview.openAdmission")}</Button></CardContent>
				</Card>; })}</div>}
		</section>
		<section className="admin-setting-section" aria-labelledby="submission-settings-title">
			<div className="admin-setting-section-heading">
				<h2 id="submission-settings-title">{t("overview.submissionSectionTitle")}</h2>
				<p>{t("overview.submissionSectionDescription")}</p>
			</div>
			{settings.isPending ? <AdminLoading /> : settings.isError ? (
				<AdminError title={t("errors.loadTitle")} description={t("overview.loadError")} retry={() => settings.refetch()} retryLabel={t("actions.retry")} />
			) : <div className="admin-round-settings">
				{roundIds.map((round) => {
					const isOpen = settings.data[round];
					const isUpdating = update.isPending && update.variables?.round === round;
					return <Card className="admin-round-setting" key={round}>
						<CardHeader><div><CardTitle>{t("overview.roundTitle", { round })}</CardTitle><p>{t("overview.roundDescription", { round })}</p></div>
							<span className={isOpen ? "is-open" : "is-closed"}>{t(isOpen ? "overview.open" : "overview.closed")}</span>
						</CardHeader>
						<CardContent><Button variant={isOpen ? "default" : "outline"} role="switch" aria-checked={isOpen}
							disabled={update.isPending} onClick={() => update.mutate({ round, isOpen: !isOpen })}
						>{isUpdating ? t("overview.updating") : t(isOpen ? "overview.closeAction" : "overview.openAction")}</Button></CardContent>
					</Card>;
				})}
			</div>}
		</section>
		<section className="admin-setting-section" aria-labelledby="tab-settings-title">
			<div className="admin-setting-section-heading">
				<h2 id="tab-settings-title">{t("overview.tabSectionTitle")}</h2>
				<p>{t("overview.tabSectionDescription")}</p>
			</div>
			{tabSettings.isPending ? <AdminLoading /> : tabSettings.isError ? (
				<AdminError title={t("errors.loadTitle")} description={t("overview.tabLoadError")} retry={() => tabSettings.refetch()} retryLabel={t("actions.retry")} />
			) : <div className="admin-round-settings">
				{roundIds.map((round) => {
					const isVisible = tabSettings.data[round];
					const isUpdating = updateTab.isPending && updateTab.variables?.round === round;
					return <Card className="admin-round-setting" key={round}>
						<CardHeader><div><CardTitle>{t("overview.tabRoundTitle", { round })}</CardTitle><p>{t("overview.tabRoundDescription", { round })}</p></div>
							<span className={isVisible ? "is-visible" : "is-hidden"}>{t(isVisible ? "overview.visible" : "overview.hidden")}</span>
						</CardHeader>
						<CardContent><Button variant={isVisible ? "default" : "outline"} role="switch" aria-checked={isVisible}
							disabled={updateTab.isPending} onClick={() => updateTab.mutate({ round, isVisible: !isVisible })}
						>{isUpdating ? t("overview.updating") : t(isVisible ? "overview.hideAction" : "overview.showAction")}</Button></CardContent>
					</Card>;
				})}
			</div>}
		</section>
	</>;
}
