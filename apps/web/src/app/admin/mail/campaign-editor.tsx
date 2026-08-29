"use client";

import {
	admissionMethods,
	eliminationFilters,
	mailCampaignPlaceholders,
	preferenceStatuses,
	registrationStatuses,
	submissionFilters,
	type MailCampaignInput,
} from "@masc-landing/api/mail-campaign-schema";
import { rounds, type RoundId } from "@masc-landing/api/rounds";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EyeIcon, SaveIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useRoundLabel } from "@/hooks/use-round-label";
import { trpc } from "@/utils/trpc";
import RichTextEditor, { richTextHasContent } from "./rich-text-editor";

type CampaignEditorProps = {
	initial: MailCampaignInput;
	campaignId?: string;
	archived?: boolean;
	onDirtyChange?: (dirty: boolean) => void;
};

function toggleValue<T extends string>(values: T[], value: T) {
	return values.includes(value) ? values.length === 1 ? values : values.filter((item) => item !== value) : [...values, value];
}

export const emptyMailCampaign: MailCampaignInput = {
	name: "",
	round: "0.5",
	registrationStatuses: [...registrationStatuses],
	eliminationFilter: "any",
	submissionFilter: "any",
	preferenceStatuses: [...preferenceStatuses],
	admissionMethods: [...admissionMethods],
	subjectTemplate: "",
	bodyTemplate: "",
};

export default function CampaignEditor({ initial, campaignId, archived = false, onDirtyChange }: CampaignEditorProps) {
	const t = useTranslations("Admin.mail");
	const roundLabel = useRoundLabel();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [form, setForm] = useState(initial);
	const [saved, setSaved] = useState(initial);
	const [previewTeamId, setPreviewTeamId] = useState<string>();
	const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
	const previewReady = !!(form.name.trim() && form.subjectTemplate.trim() && richTextHasContent(form.bodyTemplate));
	useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

	const preview = useMutation(trpc.admin.previewMailCampaign.mutationOptions());
	const previewCampaign = preview.mutate;
	useEffect(() => {
		if (!form.name.trim() || !form.subjectTemplate.trim() || !richTextHasContent(form.bodyTemplate)
			|| !form.registrationStatuses.length || !form.preferenceStatuses.length || !form.admissionMethods.length) return;
		const timer = window.setTimeout(() => previewCampaign({ campaign: form, teamId: previewTeamId }), 450);
		return () => window.clearTimeout(timer);
	}, [form, previewTeamId, previewCampaign]);

	const create = useMutation(trpc.admin.createMailCampaign.mutationOptions({
		onSuccess: ({ id }) => {
			toast.success(t("saveSuccess"));
			router.push(`/admin/mail/${id}`);
		},
		onError: () => toast.error(t("saveError")),
	}));
	const update = useMutation(trpc.admin.updateMailCampaign.mutationOptions({
		onSuccess: async () => {
			setSaved(form);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: trpc.admin.getMailCampaign.queryKey({ campaignId: campaignId! }) }),
				queryClient.invalidateQueries({ queryKey: trpc.admin.listMailCampaigns.queryKey({ archived: false }) }),
			]);
			toast.success(t("saveSuccess"));
		},
		onError: () => toast.error(t("saveError")),
	}));
	const save = () => {
		if (campaignId) update.mutate({ campaignId, ...form });
		else create.mutate(form);
	};
	const pending = create.isPending || update.isPending;
	const canSave = !!(!archived && dirty && form.name.trim() && form.subjectTemplate.trim() && richTextHasContent(form.bodyTemplate)
		&& form.registrationStatuses.length > 0 && form.preferenceStatuses.length > 0 && form.admissionMethods.length > 0);

	return <div className="mail-campaign-editor">
		<Card className="mail-campaign-form-card"><CardHeader><CardTitle>{t("editor.title")}</CardTitle></CardHeader>
			<CardContent className="mail-campaign-form">
				<div className="mail-form-field"><Label htmlFor="campaign-name">{t("fields.name")}</Label>
					<Input id="campaign-name" value={form.name} maxLength={160} disabled={archived}
						onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
				<div className="mail-audience-grid">
					<div className="mail-form-field"><Label htmlFor="campaign-round">{t("fields.round")}</Label>
						<select id="campaign-round" value={form.round} disabled={archived}
							onChange={(event) => setForm((current) => ({ ...current, round: event.target.value as RoundId }))}>
							{rounds.map((round) => <option key={round.id} value={round.id}>{roundLabel(round.id)}</option>)}</select></div>
					<div className="mail-form-field"><Label htmlFor="elimination-filter">{t("fields.elimination")}</Label>
						<select id="elimination-filter" value={form.eliminationFilter} disabled={archived}
							onChange={(event) => setForm((current) => ({ ...current, eliminationFilter: event.target.value as MailCampaignInput["eliminationFilter"] }))}>
							{eliminationFilters.map((filter) => <option key={filter} value={filter}>{t(`audience.elimination.${filter}`)}</option>)}</select></div>
					<div className="mail-form-field"><Label htmlFor="submission-filter">{t("fields.submission")}</Label>
						<select id="submission-filter" value={form.submissionFilter} disabled={archived}
							onChange={(event) => setForm((current) => ({ ...current, submissionFilter: event.target.value as MailCampaignInput["submissionFilter"] }))}>
							{submissionFilters.map((filter) => <option key={filter} value={filter}>{t(`audience.submission.${filter}`)}</option>)}</select></div>
				</div>
				<FilterChecks label={t("fields.registrationStatuses")} disabled={archived}
					options={registrationStatuses.map((status) => ({ value: status, label: t(`audience.registration.${status}`) }))}
					values={form.registrationStatuses} onToggle={(value) => setForm((current) => ({
						...current, registrationStatuses: toggleValue(current.registrationStatuses, value),
					}))} />
				{form.round === "1" && <div className="mail-round-one-filters">
					<FilterChecks label={t("fields.preferenceStatuses")} disabled={archived}
						options={preferenceStatuses.map((status) => ({ value: status, label: t(`audience.preference.${status}`) }))}
						values={form.preferenceStatuses} onToggle={(value) => setForm((current) => ({
							...current, preferenceStatuses: toggleValue(current.preferenceStatuses, value),
						}))} />
					<FilterChecks label={t("fields.admissionMethods")} disabled={archived}
						options={admissionMethods.map((method) => ({ value: method, label: t(`audience.admission.${method}`) }))}
						values={form.admissionMethods} onToggle={(value) => setForm((current) => ({
							...current, admissionMethods: toggleValue(current.admissionMethods, value),
						}))} />
				</div>}
				<div className="mail-match-count" aria-live="polite">
					<strong>{previewReady && preview.data ? t("audience.matches", { count: preview.data.matchCount }) : t("audience.matchesUnknown")}</strong>
					{preview.isError && <span>{t("preview.invalid")}</span>}
				</div>
				<div className="mail-form-field"><Label htmlFor="campaign-subject">{t("fields.subject")}</Label>
					<Input id="campaign-subject" value={form.subjectTemplate} maxLength={250} disabled={archived}
						onChange={(event) => setForm((current) => ({ ...current, subjectTemplate: event.target.value }))} /></div>
				<div className="mail-form-field"><Label htmlFor="campaign-body">{t("fields.body")}</Label>
					<RichTextEditor id="campaign-body" ariaLabel={t("fields.body")} value={form.bodyTemplate} maxLength={20_000} disabled={archived}
						labels={{
							toolbar: t("richText.toolbar"),
							bold: t("richText.bold"), italic: t("richText.italic"), underline: t("richText.underline"),
							link: t("richText.link"), linkTitle: t("richText.linkTitle"), linkDescription: t("richText.linkDescription"),
							linkUrl: t("richText.linkUrl"), linkPlaceholder: t("richText.linkPlaceholder"), linkInvalid: t("richText.linkInvalid"),
							linkApply: t("richText.linkApply"), linkRemove: t("richText.linkRemove"), cancel: t("cancel"),
						}}
						onChange={(bodyTemplate) => setForm((current) => ({ ...current, bodyTemplate }))} /></div>
				<div className="mail-placeholder-help"><strong>{t("placeholders.title")}</strong><p>{t("placeholders.description")}</p>
					<div>{mailCampaignPlaceholders.map((placeholder) => <code key={placeholder}>{`{{${placeholder}}}`}</code>)}</div>
					<p>{t("placeholders.optional")}</p></div>
				<div className="mail-editor-actions"><Button type="button" disabled={!canSave || pending} onClick={save}>
					<SaveIcon />{pending ? t("saving") : t(campaignId ? "saveChanges" : "create")}</Button>
					{dirty && campaignId && <span>{t("unsaved")}</span>}</div>
			</CardContent></Card>
		<Card className="mail-campaign-preview-card"><CardHeader><CardTitle><EyeIcon />{t("preview.title")}</CardTitle></CardHeader>
			<CardContent>{previewReady && preview.data?.teams.length ? <>
				<Label htmlFor="preview-team">{t("preview.team")}</Label>
				<select id="preview-team" value={preview.data.preview?.teamId ?? ""}
					onChange={(event) => setPreviewTeamId(event.target.value)}>
					{preview.data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
				{preview.data.preview && <div className="mail-preview-content">
					<dl><div><dt>{t("fields.to")}</dt><dd>{preview.data.preview.toAddress}</dd></div>
						<div><dt>{t("fields.cc")}</dt><dd>{preview.data.preview.cc.join(", ") || "—"}</dd></div>
						<div><dt>{t("fields.subject")}</dt><dd>{preview.data.preview.subject}</dd></div></dl>
					<iframe sandbox="" srcDoc={preview.data.preview.html} title={t("preview.frameTitle", { team: preview.data.preview.teamName })} />
				</div>}
			</> : <p className="mail-preview-empty">{preview.isPending ? t("preview.loading") : t("preview.empty")}</p>}</CardContent></Card>
	</div>;
}

function FilterChecks<T extends string>({ label, options, values, onToggle, disabled }: {
	label: string;
	options: { value: T; label: string }[];
	values: T[];
	onToggle: (value: T) => void;
	disabled: boolean;
}) {
	return <fieldset className="mail-filter-checks" disabled={disabled}><legend>{label}</legend>
		{options.map((option) => <label key={option.value}><input type="checkbox" checked={values.includes(option.value)}
			onChange={() => onToggle(option.value)} />{option.label}</label>)}</fieldset>;
}
