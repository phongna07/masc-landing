"use client";

import type { UploadLimitKind } from "@masc-landing/api/upload-limits";
import { Button } from "@masc-landing/ui/components/button";
import { roundIds } from "@masc-landing/api/rounds";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useRoundLabel } from "@/hooks/use-round-label";
import { trpc } from "@/utils/trpc";

import { AdminError, AdminHeading, AdminLoading } from "../admin-state";

const MEBIBYTE = 1024 * 1024;

export default function AdminPage() {
	const t = useTranslations("Admin");
	const roundLabel = useRoundLabel();
	const dashboardTabSettings = useQuery(trpc.admin.getDashboardTabSettings.queryOptions());
	const settings = useQuery(trpc.admin.getSubmissionSettings.queryOptions());
	const admissionSettings = useQuery(trpc.admin.getAdmissionSettings.queryOptions());
	const uploadLimits = useQuery(trpc.admin.getUploadLimits.queryOptions());
	const updateDashboardTab = useMutation(trpc.admin.setDashboardTabVisible.mutationOptions({
		onSuccess: async () => { await dashboardTabSettings.refetch(); toast.success(t("overview.visibilitySuccess")); },
		onError: () => toast.error(t("overview.visibilityError")),
	}));
	const update = useMutation(trpc.admin.setRoundSubmissionOpen.mutationOptions({
		onSuccess: async (data) => {
			settings.refetch();
			toast.success(t("overview.success"));
			return data;
		},
		onError: () => toast.error(t("overview.error")),
	}));
	const updateAdmission = useMutation(trpc.admin.setRoundAdmissionOpen.mutationOptions({
		onSuccess: async () => { await admissionSettings.refetch(); toast.success(t("overview.admissionSuccess")); },
		onError: () => toast.error(t("overview.admissionError")),
	}));

	return <>
		<AdminHeading eyebrow={t("eyebrow")} title={t("overview.title")} description={t("overview.description")} />
		<section className="admin-setting-section" aria-labelledby="dashboard-visibility-settings-title">
			<div className="admin-setting-section-heading"><h2 id="dashboard-visibility-settings-title">{t("overview.visibilitySectionTitle")}</h2>
				<p>{t("overview.visibilitySectionDescription")}</p></div>
			{dashboardTabSettings.isPending ? <AdminLoading /> : dashboardTabSettings.isError ?
				<AdminError title={t("errors.loadTitle")} description={t("overview.visibilityLoadError")} retry={() => dashboardTabSettings.refetch()} retryLabel={t("actions.retry")} /> :
				<div className="admin-round-settings">{roundIds.map((round) => {
					const displayRound = roundLabel(round);
					const isVisible = dashboardTabSettings.data[round];
					const isUpdating = updateDashboardTab.isPending && updateDashboardTab.variables?.round === round;
					return <Card className="admin-round-setting" key={round}>
						<CardHeader><div><CardTitle>{t("overview.roundTitle", { roundLabel: displayRound })}</CardTitle><p>{t("overview.visibilityRoundDescription", { roundLabel: displayRound })}</p></div>
							<span className={isVisible ? "is-open" : "is-closed"}>{t(isVisible ? "overview.visible" : "overview.hidden")}</span></CardHeader>
						<CardContent><Button variant={isVisible ? "default" : "outline"} role="switch" aria-checked={isVisible}
							disabled={updateDashboardTab.isPending} onClick={() => updateDashboardTab.mutate({ round, isVisible: !isVisible })}
						>{isUpdating ? t("overview.updating") : t(isVisible ? "overview.hideAction" : "overview.showAction")}</Button></CardContent>
					</Card>;
				})}</div>}
		</section>
		<section className="admin-setting-section" aria-labelledby="admission-settings-title">
			<div className="admin-setting-section-heading"><h2 id="admission-settings-title">{t("overview.admissionSectionTitle")}</h2>
				<p>{t("overview.admissionSectionDescription")}</p></div>
			{admissionSettings.isPending ? <AdminLoading /> : admissionSettings.isError ?
				<AdminError title={t("errors.loadTitle")} description={t("overview.admissionLoadError")} retry={() => admissionSettings.refetch()} retryLabel={t("actions.retry")} /> :
				<div className="admin-round-settings">{(["0.5", "1"] as const).map((round) => { const displayRound = roundLabel(round); const isOpen = admissionSettings.data[round]; return <Card className="admin-round-setting" key={round}>
					<CardHeader><div><CardTitle>{t("overview.roundTitle", { roundLabel: displayRound })}</CardTitle><p>{t("overview.admissionRoundDescription", { roundLabel: displayRound })}</p></div>
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
					const displayRound = roundLabel(round);
					const isOpen = settings.data[round];
					const isUpdating = update.isPending && update.variables?.round === round;
					return <Card className="admin-round-setting" key={round}>
						<CardHeader><div><CardTitle>{t("overview.roundTitle", { roundLabel: displayRound })}</CardTitle><p>{t("overview.roundDescription", { roundLabel: displayRound })}</p></div>
							<span className={isOpen ? "is-open" : "is-closed"}>{t(isOpen ? "overview.open" : "overview.closed")}</span>
						</CardHeader>
						<CardContent><Button variant={isOpen ? "default" : "outline"} role="switch" aria-checked={isOpen}
							disabled={update.isPending} onClick={() => update.mutate({ round, isOpen: !isOpen })}
						>{isUpdating ? t("overview.updating") : t(isOpen ? "overview.closeAction" : "overview.openAction")}</Button></CardContent>
					</Card>;
				})}
			</div>}
		</section>
		<section className="admin-setting-section" aria-labelledby="upload-limit-settings-title">
			<div className="admin-setting-section-heading"><h2 id="upload-limit-settings-title">{t("overview.uploadLimits.title")}</h2>
				<p>{t("overview.uploadLimits.description")}</p></div>
			{uploadLimits.isPending ? <AdminLoading /> : uploadLimits.isError ?
				<AdminError title={t("errors.loadTitle")} description={t("overview.uploadLimits.loadError")}
					retry={() => uploadLimits.refetch()} retryLabel={t("actions.retry")} /> :
				<div className="admin-upload-limit-settings">
					{(["participantCv", "roundSubmission"] as const).map((kind) =>
						<UploadLimitCard key={kind} kind={kind} maxFileSize={uploadLimits.data[kind]}
							onSaved={() => uploadLimits.refetch()} />)}
				</div>}
		</section>
	</>;
}

function UploadLimitCard({ kind, maxFileSize, onSaved }: {
	kind: UploadLimitKind;
	maxFileSize: number;
	onSaved: () => Promise<unknown>;
}) {
	const t = useTranslations("Admin");
	const [value, setValue] = useState(String(maxFileSize / MEBIBYTE));
	const [error, setError] = useState<string | null>(null);
	const update = useMutation(trpc.admin.setUploadLimit.mutationOptions({
		onSuccess: async (data) => {
			setValue(String(data[kind] / MEBIBYTE));
			setError(null);
			await onSaved();
			toast.success(t("overview.uploadLimits.success"));
		},
		onError: () => toast.error(t("overview.uploadLimits.error")),
	}));

	useEffect(() => {
		setValue(String(maxFileSize / MEBIBYTE));
		setError(null);
	}, [maxFileSize]);

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const cleanValue = value.trim();
		if (!cleanValue) return setError(t("overview.uploadLimits.validation.required"));
		if (!/^\d+$/.test(cleanValue)) return setError(t("overview.uploadLimits.validation.integer"));
		const maxFileSizeMiB = Number(cleanValue);
		if (maxFileSizeMiB < 1 || maxFileSizeMiB > 100) {
			return setError(t("overview.uploadLimits.validation.range"));
		}
		setError(null);
		update.mutate({ kind, maxFileSizeMiB });
	};

	const inputId = `upload-limit-${kind}`;
	const errorId = `${inputId}-error`;
	return <Card className="admin-round-setting admin-upload-limit-card">
		<CardHeader><div><CardTitle>{t(`overview.uploadLimits.${kind}.title`)}</CardTitle>
			<p>{t(`overview.uploadLimits.${kind}.description`)}</p></div></CardHeader>
		<CardContent><form className="admin-upload-limit-form" onSubmit={submit} noValidate>
			<div className="admin-upload-limit-field"><Label htmlFor={inputId}>{t("overview.uploadLimits.inputLabel")}</Label>
				<div className="admin-upload-limit-input"><Input id={inputId} type="number" min="1" max="100" step="1"
					inputMode="numeric" value={value} disabled={update.isPending} aria-invalid={!!error}
					aria-describedby={error ? errorId : undefined} onChange={(event) => setValue(event.target.value)} />
					<span aria-hidden="true">MiB</span></div></div>
			{error && <p className="admin-file-error" id={errorId} role="alert">{error}</p>}
			<Button type="submit" disabled={update.isPending}>{update.isPending
				? t("overview.uploadLimits.saving") : t("overview.uploadLimits.save")}</Button>
		</form></CardContent>
	</Card>;
}
