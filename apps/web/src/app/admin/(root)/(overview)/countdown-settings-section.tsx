"use client";

import type { HomeCountdownInput } from "@masc-landing/api/home-countdown-settings";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { Input } from "@masc-landing/ui/components/input";
import { Label } from "@masc-landing/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

import { AdminError, AdminLoading } from "../../admin-state";

const vietnamOffsetMilliseconds = 7 * 60 * 60 * 1000;
const locales = ["en", "vi"] as const;
const copyFields = ["applications", "closesIn", "opensIn", "closed"] as const;

type Draft = Omit<HomeCountdownInput, "openAt" | "closeAt"> & {
	openAt: string;
	closeAt: string;
};

function toVietnamInput(iso: string) {
	return new Date(Date.parse(iso) + vietnamOffsetMilliseconds).toISOString().slice(0, 16);
}

function fromVietnamInput(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
	const date = new Date(`${value}:00+07:00`);
	if (!Number.isFinite(date.getTime()) || toVietnamInput(date.toISOString()) !== value) return null;
	return date.toISOString();
}

function makeDraft(settings: HomeCountdownInput): Draft {
	return {
		openAt: toVietnamInput(settings.openAt),
		closeAt: toVietnamInput(settings.closeAt),
		en: { ...settings.en },
		vi: { ...settings.vi },
	};
}

export default function CountdownSettingsSection() {
	const t = useTranslations("Admin");
	const settings = useQuery(trpc.admin.getHomeCountdownSettings.queryOptions());

	return <section className="admin-setting-section" aria-labelledby="home-countdown-settings-title">
		<div className="admin-setting-section-heading">
			<h2 id="home-countdown-settings-title">{t("overview.countdown.title")}</h2>
			<p>{t("overview.countdown.description")}</p>
		</div>
		{settings.isPending ? <AdminLoading /> : settings.isError ?
			<AdminError title={t("errors.loadTitle")} description={t("overview.countdown.loadError")}
				retry={() => settings.refetch()} retryLabel={t("actions.retry")} /> :
			<CountdownSettingsForm settings={settings.data} onSaved={() => settings.refetch()} />}
	</section>;
}

function CountdownSettingsForm({ settings, onSaved }: {
	settings: HomeCountdownInput;
	onSaved: () => Promise<unknown>;
}) {
	const t = useTranslations("Admin");
	const [draft, setDraft] = useState(() => makeDraft(settings));
	const [error, setError] = useState<string | null>(null);
	const update = useMutation(trpc.admin.setHomeCountdownSettings.mutationOptions({
		onSuccess: async () => {
			await onSaved();
			setError(null);
			toast.success(t("overview.countdown.success"));
		},
		onError: () => {
			setError(t("overview.countdown.saveError"));
			toast.error(t("overview.countdown.saveError"));
		},
	}));

	useEffect(() => {
		setDraft(makeDraft(settings));
	}, [settings]);

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!draft.openAt || !draft.closeAt) return setError(t("overview.countdown.requiredDates"));
		const openAt = fromVietnamInput(draft.openAt);
		const closeAt = fromVietnamInput(draft.closeAt);
		if (!openAt || !closeAt) return setError(t("overview.countdown.invalidDates"));
		if (Date.parse(openAt) >= Date.parse(closeAt)) return setError(t("overview.countdown.invalidOrder"));
		if (locales.some((locale) => copyFields.some((field) => !draft[locale][field].trim()))) {
			return setError(t("overview.countdown.requiredCopy"));
		}
		setError(null);
		update.mutate({ openAt, closeAt, en: draft.en, vi: draft.vi });
	};

	return <Card className="admin-round-setting admin-countdown-card"><CardContent>
		<form className="admin-countdown-form" onSubmit={submit} noValidate>
			<div className="admin-countdown-grid">
				{(["openAt", "closeAt"] as const).map((field) => <div className="admin-countdown-field" key={field}>
					<Label htmlFor={`countdown-${field}`}>{t(`overview.countdown.${field}`)}</Label>
					<Input id={`countdown-${field}`} type="datetime-local" step="60" value={draft[field]}
						disabled={update.isPending} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} />
				</div>)}
			</div>
			<p className="admin-countdown-timezone">{t("overview.countdown.timezone")}</p>
			<div className="admin-countdown-locales">{locales.map((locale) => <fieldset key={locale} className="admin-countdown-locale">
				<legend>{t(`overview.countdown.${locale}`)}</legend>
				<div className="admin-countdown-grid">{copyFields.map((field) => <div className="admin-countdown-field" key={field}>
					<Label htmlFor={`countdown-${locale}-${field}`}>{t(`overview.countdown.${field}`)}</Label>
					<Input id={`countdown-${locale}-${field}`} value={draft[locale][field]} maxLength={200}
						disabled={update.isPending} onChange={(event) => setDraft((current) => ({
							...current, [locale]: { ...current[locale], [field]: event.target.value },
						}))} />
				</div>)}</div>
			</fieldset>)}</div>
			{error && <p className="admin-file-error" role="alert">{error}</p>}
			<Button type="submit" disabled={update.isPending}>{t(update.isPending ? "overview.countdown.saving" : "overview.countdown.save")}</Button>
		</form>
	</CardContent></Card>;
}
