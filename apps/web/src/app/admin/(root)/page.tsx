"use client";

import type { UploadLimitKind } from "@masc-landing/api/upload-limits";
import { MAX_PROBLEM_STATEMENT_FILE_SIZE } from "@masc-landing/api/round-one-problem-statements";
import { Button } from "@masc-landing/ui/components/button";
import { roundIds } from "@masc-landing/api/rounds";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { ConfirmationDialog } from "@masc-landing/ui/components/confirmation-dialog";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@masc-landing/ui/components/dialog";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, DownloadIcon, FileTextIcon, PencilIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react";

import { useRoundLabel } from "@/hooks/use-round-label";
import { trpc } from "@/utils/trpc";

import { AdminError, AdminHeading, AdminLoading } from "../admin-state";
import RichTextEditor from "../mail/rich-text-editor";

const MEBIBYTE = 1024 * 1024;

export default function AdminPage() {
	const t = useTranslations("Admin");
	const roundLabel = useRoundLabel();
	const dashboardTabSettings = useQuery(trpc.admin.getDashboardTabSettings.queryOptions());
	const roundEndSettings = useQuery(trpc.admin.getRoundEndSettings.queryOptions());
	const settings = useQuery(trpc.admin.getSubmissionSettings.queryOptions());
	const admissionSettings = useQuery(trpc.admin.getAdmissionSettings.queryOptions());
	const uploadLimits = useQuery(trpc.admin.getUploadLimits.queryOptions());
	const updateDashboardTab = useMutation(trpc.admin.setDashboardTabVisible.mutationOptions({
		onSuccess: async () => { await dashboardTabSettings.refetch(); toast.success(t("overview.visibilitySuccess")); },
		onError: () => toast.error(t("overview.visibilityError")),
	}));
	const updateRoundEnded = useMutation(trpc.admin.setRoundEnded.mutationOptions({
		onSuccess: async () => { await roundEndSettings.refetch(); toast.success(t("overview.roundEndSuccess")); },
		onError: () => toast.error(t("overview.roundEndError")),
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
		<PreferenceSettingsSection />
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
		<section className="admin-setting-section" aria-labelledby="round-end-settings-title">
			<div className="admin-setting-section-heading"><h2 id="round-end-settings-title">{t("overview.roundEndSectionTitle")}</h2>
				<p>{t("overview.roundEndSectionDescription")}</p></div>
			{roundEndSettings.isPending ? <AdminLoading /> : roundEndSettings.isError ?
				<AdminError title={t("errors.loadTitle")} description={t("overview.roundEndLoadError")} retry={() => roundEndSettings.refetch()} retryLabel={t("actions.retry")} /> :
				<div className="admin-round-settings">{roundIds.map((round) => {
					const displayRound = roundLabel(round);
					const isEnded = roundEndSettings.data[round];
					const isUpdating = updateRoundEnded.isPending && updateRoundEnded.variables?.round === round;
					return <Card className="admin-round-setting" key={round}>
						<CardHeader><div><CardTitle>{t("overview.roundTitle", { roundLabel: displayRound })}</CardTitle><p>{t("overview.roundEndRoundDescription", { roundLabel: displayRound })}</p></div>
							<span className={isEnded ? "is-closed" : "is-open"}>{t(isEnded ? "overview.ended" : "overview.notEnded")}</span></CardHeader>
						<CardContent><Button variant={isEnded ? "default" : "outline"} role="switch" aria-checked={isEnded}
							disabled={updateRoundEnded.isPending} onClick={() => updateRoundEnded.mutate({ round, isEnded: !isEnded })}
						>{isUpdating ? t("overview.updating") : t(isEnded ? "overview.markNotEnded" : "overview.markEnded")}</Button></CardContent>
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

function PreferenceSettingsSection() {
	const t = useTranslations("Admin");
	const settings = useQuery(trpc.admin.getRoundOnePreferenceSettings.queryOptions());
	const publicationSettings = useQuery(trpc.admin.getProblemStatementPublicationSettings.queryOptions());
	const [newName, setNewName] = useState("");
	const create = useMutation(trpc.admin.createRoundOnePreferenceSetting.mutationOptions({
		onSuccess: async () => { setNewName(""); await settings.refetch(); toast.success(t("overview.preferences.success")); },
		onError: () => toast.error(t("overview.preferences.error")),
	}));
	const update = useMutation(trpc.admin.updateRoundOnePreferenceSetting.mutationOptions({
		onSuccess: async () => { await settings.refetch(); toast.success(t("overview.preferences.success")); },
		onError: () => toast.error(t("overview.preferences.error")),
	}));
	const updatePublication = useMutation(trpc.admin.setProblemStatementPublished.mutationOptions({
		onSuccess: async () => {
			await publicationSettings.refetch();
			toast.success(t("overview.preferences.publication.success"));
		},
		onError: () => toast.error(t("overview.preferences.publication.error")),
	}));
	const reorder = useMutation(trpc.admin.reorderRoundOnePreferenceSettings.mutationOptions({
		onSuccess: async () => { await settings.refetch(); toast.success(t("overview.preferences.success")); },
		onError: () => toast.error(t("overview.preferences.error")),
	}));
	const move = (index: number, direction: -1 | 1) => {
		if (!settings.data) return;
		const target = index + direction;
		if (target < 0 || target >= settings.data.length) return;
		const orderedIds = settings.data.map((setting) => setting.id);
		[orderedIds[index], orderedIds[target]] = [orderedIds[target]!, orderedIds[index]!];
		reorder.mutate({ orderedIds });
	};
	const add = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const name = newName.trim();
		if (name) create.mutate({ name });
	};
	return <section className="admin-setting-section" aria-labelledby="preference-settings-title">
		<div className="admin-setting-section-heading"><h2 id="preference-settings-title">{t("overview.preferences.title")}</h2>
			<p>{t("overview.preferences.description")}</p></div>
		{publicationSettings.isPending ? <AdminLoading /> : publicationSettings.isError ?
			<AdminError title={t("errors.loadTitle")} description={t("overview.preferences.publication.loadError")}
				retry={() => publicationSettings.refetch()} retryLabel={t("actions.retry")} /> :
			<Card className="admin-round-setting admin-problem-publication">
				<CardHeader><div><CardTitle>{t("overview.preferences.publication.title")}</CardTitle>
					<p>{t("overview.preferences.publication.description")}</p></div>
					<span className={publicationSettings.data["1"] ? "is-open" : "is-closed"}>
						{t(publicationSettings.data["1"] ? "overview.preferences.publication.published" : "overview.preferences.publication.unpublished")}
					</span></CardHeader>
				<CardContent><Button type="button" role="switch" aria-checked={publicationSettings.data["1"]}
					disabled={updatePublication.isPending}
					onClick={() => updatePublication.mutate({ round: "1", isPublished: !publicationSettings.data["1"] })}>
					{updatePublication.isPending ? t("overview.updating") : t(publicationSettings.data["1"]
						? "overview.preferences.publication.unpublish" : "overview.preferences.publication.publish")}
				</Button></CardContent>
			</Card>}
		{settings.isPending ? <AdminLoading /> : settings.isError ? <AdminError title={t("errors.loadTitle")}
			description={t("overview.preferences.loadError")} retry={() => settings.refetch()} retryLabel={t("actions.retry")} /> : <>
			<div className="admin-preference-settings">{settings.data.map((setting, index) => <PreferenceSettingRow key={setting.id}
				setting={setting} disabled={update.isPending || reorder.isPending}
				onChanged={() => settings.refetch()}
				onSave={(name) => update.mutate({ id: setting.id, name })}
				onSaveDescription={(description) => update.mutateAsync({ id: setting.id, description })}
				onToggle={() => update.mutate({ id: setting.id, isActive: !setting.isActive })}
				onMoveUp={() => move(index, -1)} onMoveDown={() => move(index, 1)}
				first={index === 0} last={index === settings.data.length - 1} />)}</div>
			<form className="admin-preference-add" onSubmit={add}><Label htmlFor="new-preference-name">{t("overview.preferences.newLabel")}</Label>
				<div><Input id="new-preference-name" value={newName} maxLength={160} onChange={(event) => setNewName(event.target.value)}
					placeholder={t("overview.preferences.newPlaceholder")} />
					<Button type="submit" disabled={!newName.trim() || create.isPending}><PlusIcon />{t("overview.preferences.add")}</Button></div>
			</form>
		</>}
	</section>;
}

function PreferenceSettingRow({ setting, disabled, onChanged, onSave, onSaveDescription, onToggle, onMoveUp, onMoveDown, first, last }: {
	setting: {
		id: string;
		name: string;
		description: string | null;
		isActive: boolean;
		problemStatement: { originalFilename: string; fileSize: number } | null;
	};
	disabled: boolean;
	onChanged: () => Promise<unknown>;
	onSave: (name: string) => void;
	onSaveDescription: (description: string) => Promise<unknown>;
	onToggle: () => void;
	onMoveUp: () => void;
	onMoveDown: () => void;
	first: boolean;
	last: boolean;
}) {
	const t = useTranslations("Admin");
	const [name, setName] = useState(setting.name);
	const [file, setFile] = useState<File | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const createUploadUrl = useMutation(trpc.roundOneProblemStatement.createUploadUrl.mutationOptions());
	const replace = useMutation(trpc.roundOneProblemStatement.replace.mutationOptions());
	const download = useMutation(trpc.roundOneProblemStatement.createAdminDownloadUrl.mutationOptions({
		onSuccess: ({ downloadUrl }) => window.location.assign(downloadUrl),
		onError: () => toast.error(t("overview.preferences.problemStatement.downloadError")),
	}));
	const remove = useMutation(trpc.roundOneProblemStatement.remove.mutationOptions({
		onSuccess: async () => {
			await onChanged();
			toast.success(t("overview.preferences.problemStatement.deleteSuccess"));
		},
		onError: () => toast.error(t("overview.preferences.problemStatement.deleteError")),
	}));
	useEffect(() => setName(setting.name), [setting.name]);
	const rowDisabled = disabled || isUploading || remove.isPending;
	const inputId = `problem-statement-${setting.id}`;
	const upload = async () => {
		setFileError(null);
		if (!file) return setFileError(t("overview.preferences.problemStatement.validation.required"));
		if (!file.name.toLowerCase().endsWith(".pdf")) {
			return setFileError(t("overview.preferences.problemStatement.validation.type"));
		}
		if (file.size <= 0) return setFileError(t("overview.preferences.problemStatement.validation.empty"));
		if (file.size > MAX_PROBLEM_STATEMENT_FILE_SIZE) {
			return setFileError(t("overview.preferences.problemStatement.validation.size"));
		}
		const metadata = {
			trackId: setting.id,
			filename: file.name,
			mimeType: "application/pdf" as const,
			fileSize: file.size,
		};
		setIsUploading(true);
		try {
			const signed = await createUploadUrl.mutateAsync(metadata);
			const response = await fetch(signed.uploadUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": "application/pdf" },
			});
			if (!response.ok) throw new Error("UPLOAD_FAILED");
			await replace.mutateAsync({ ...metadata, uploadId: signed.uploadId });
			setFile(null);
			if (fileInputRef.current) fileInputRef.current.value = "";
			await onChanged();
			toast.success(t("overview.preferences.problemStatement.uploadSuccess"));
		} catch {
			setFileError(t("overview.preferences.problemStatement.uploadError"));
		} finally {
			setIsUploading(false);
		}
	};
	return <div className="admin-preference-setting-row">
		<form className="admin-preference-setting-main" onSubmit={(event) => {
			event.preventDefault(); const value = name.trim(); if (value && value !== setting.name) onSave(value);
		}}>
			<div className="admin-preference-order-actions">
				<Button type="button" size="icon-sm" variant="outline" aria-label={t("overview.preferences.moveUp")}
					disabled={rowDisabled || first} onClick={onMoveUp}><ArrowUpIcon /></Button>
				<Button type="button" size="icon-sm" variant="outline" aria-label={t("overview.preferences.moveDown")}
					disabled={rowDisabled || last} onClick={onMoveDown}><ArrowDownIcon /></Button>
			</div>
			<Input value={name} maxLength={160} disabled={rowDisabled} onChange={(event) => setName(event.target.value)} />
			<Button type="submit" variant="outline" disabled={rowDisabled || !name.trim() || name.trim() === setting.name}>{t("overview.preferences.save")}</Button>
			<Button type="button" variant={setting.isActive ? "destructive" : "outline"} disabled={rowDisabled} onClick={onToggle}>
				{t(setting.isActive ? "overview.preferences.deactivate" : "overview.preferences.activate")}</Button>
		</form>
		<div className="admin-track-description-control">
			<div><Label>{t("overview.preferences.trackDescription.label")}</Label>
				{setting.description
					? <div className="admin-track-description-preview" dangerouslySetInnerHTML={{ __html: setting.description }} />
					: <span className="field-hint">{t("overview.preferences.trackDescription.empty")}</span>}</div>
			<DescriptionEditorDialog setting={setting} disabled={rowDisabled} onSave={onSaveDescription} />
		</div>
		<div className="admin-problem-statement">
			<div className="admin-problem-statement-heading"><div><Label htmlFor={inputId}>{t("overview.preferences.problemStatement.label")}</Label>
				<span className="field-hint">{t("overview.preferences.problemStatement.hint")}</span></div>
				{setting.problemStatement && <div className="admin-problem-statement-current"><FileTextIcon aria-hidden="true" />
					<div><strong>{setting.problemStatement.originalFilename}</strong><span>{formatFileSize(setting.problemStatement.fileSize)}</span></div>
					<Button type="button" size="sm" variant="outline" disabled={download.isPending}
						onClick={() => download.mutate({ trackId: setting.id })}><DownloadIcon aria-hidden="true" />
						{t("overview.preferences.problemStatement.download")}</Button></div>}
			</div>
			<div className="admin-problem-statement-controls">
				<Input ref={fileInputRef} id={inputId} className="cv-file-input" type="file" accept=".pdf,application/pdf"
					disabled={rowDisabled} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setFileError(null); }} />
				<Button type="button" variant="outline" disabled={rowDisabled || !file} onClick={() => void upload()}>
					<UploadIcon aria-hidden="true" />{isUploading ? t("overview.preferences.problemStatement.uploading")
						: t(setting.problemStatement ? "overview.preferences.problemStatement.replace" : "overview.preferences.problemStatement.upload")}</Button>
				{setting.problemStatement && <ConfirmationDialog
					trigger={<Button type="button" variant="destructive" disabled={rowDisabled}><Trash2Icon aria-hidden="true" />
						{t("overview.preferences.problemStatement.delete")}</Button>}
					title={t("overview.preferences.problemStatement.deleteConfirmation.title")}
					description={t("overview.preferences.problemStatement.deleteConfirmation.description", { track: setting.name })}
					confirmLabel={t("overview.preferences.problemStatement.deleteConfirmation.confirm")}
					cancelLabel={t("actions.cancel")}
					icon={<Trash2Icon />} tone="destructive" onConfirm={() => remove.mutate({ trackId: setting.id })} />}
			</div>
			{fileError && <p className="admin-file-error" role="alert">{fileError}</p>}
		</div>
	</div>;
}

function DescriptionEditorDialog({ setting, disabled, onSave }: {
	setting: { id: string; name: string; description: string | null };
	disabled: boolean;
	onSave: (description: string) => Promise<unknown>;
}) {
	const t = useTranslations("Admin");
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(setting.description ?? "");
	const [saving, setSaving] = useState(false);
	const changeOpen = (nextOpen: boolean) => {
		if (saving) return;
		if (nextOpen) setDraft(setting.description ?? "");
		setOpen(nextOpen);
	};
	const save = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSaving(true);
		try {
			await onSave(draft);
			setOpen(false);
		} catch {
			// The owning mutation displays the localized error toast.
		} finally {
			setSaving(false);
		}
	};
	return <Dialog open={open} onOpenChange={changeOpen}>
		<Button type="button" variant="outline" disabled={disabled} onClick={() => changeOpen(true)}>
			<PencilIcon aria-hidden="true" />{t("overview.preferences.trackDescription.edit")}
		</Button>
		<DialogContent className="admin-track-description-dialog">
			<form onSubmit={save}>
				<DialogHeader><DialogTitle>{t("overview.preferences.trackDescription.dialogTitle", { track: setting.name })}</DialogTitle>
					<DialogDescription>{t("overview.preferences.trackDescription.dialogDescription")}</DialogDescription></DialogHeader>
				<RichTextEditor id={`track-description-${setting.id}`} ariaLabel={t("overview.preferences.trackDescription.label")}
					value={draft} maxLength={20_000} disabled={saving} onChange={setDraft} labels={{
						toolbar: t("overview.preferences.trackDescription.richText.toolbar"),
						bold: t("overview.preferences.trackDescription.richText.bold"),
						italic: t("overview.preferences.trackDescription.richText.italic"),
						underline: t("overview.preferences.trackDescription.richText.underline"),
						unorderedList: t("overview.preferences.trackDescription.richText.unorderedList"),
						orderedList: t("overview.preferences.trackDescription.richText.orderedList"),
						link: t("overview.preferences.trackDescription.richText.link"),
						linkTitle: t("overview.preferences.trackDescription.richText.linkTitle"),
						linkDescription: t("overview.preferences.trackDescription.richText.linkDescription"),
						linkUrl: t("overview.preferences.trackDescription.richText.linkUrl"),
						linkPlaceholder: t("overview.preferences.trackDescription.richText.linkPlaceholder"),
						linkInvalid: t("overview.preferences.trackDescription.richText.linkInvalid"),
						linkApply: t("overview.preferences.trackDescription.richText.linkApply"),
						linkRemove: t("overview.preferences.trackDescription.richText.linkRemove"),
						cancel: t("actions.cancel"),
					}} />
				<DialogFooter><DialogClose render={<Button type="button" variant="outline" disabled={saving} />}>
					{t("actions.cancel")}</DialogClose>
					<Button type="submit" disabled={saving}>{t(saving
						? "overview.preferences.trackDescription.saving" : "overview.preferences.trackDescription.save")}</Button>
				</DialogFooter>
			</form>
		</DialogContent>
	</Dialog>;
}

function formatFileSize(bytes: number) {
	return bytes < MEBIBYTE
		? `${Math.ceil(bytes / 1024)} KiB`
		: `${(bytes / MEBIBYTE).toFixed(1)} MiB`;
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
