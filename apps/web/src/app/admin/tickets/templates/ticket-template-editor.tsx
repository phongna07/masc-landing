"use client";

import { artworkCopyKeys, defaultTicketTemplates, emailCopyKeys, emailTemplateVariables, templateCopyLimit, ticketTemplateInput, type TicketEmailCopy } from "@masc-landing/api/tickets/template-input";
import type { previewTicketTemplates } from "@masc-landing/api/tickets/template-preview";
import type { AppRouter } from "@masc-landing/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";
import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@masc-landing/ui/components/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CodeIcon, DownloadIcon, EyeIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import RichTextEditor from "@/app/admin/mail/rich-text-editor";
import { TicketError, TicketHeading, TicketLoading } from "@/components/tickets/ticket-ui";
import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { trpc } from "@/utils/trpc";

type SavedTemplates = inferRouterOutputs<AppRouter>["tickets"]["templates"];
type Config = SavedTemplates["config"];
type Preview = Awaited<ReturnType<typeof previewTicketTemplates>>;
type Locale = "en" | "vi";
type BaseCopies = Record<Locale, TicketEmailCopy>;
type CopyKey = typeof artworkCopyKeys[number] | typeof emailCopyKeys[number];
const artworkColors = ["background", "surface", "border", "text", "muted", "accent", "normal", "vip", "valid", "revoked"] as const;
const emailColors = ["background", "surface", "border", "text", "muted", "accent", "highlight", "highlightBackground"] as const;

export default function TicketTemplateEditor({ baseCopies }: { baseCopies: BaseCopies }) {
	const t = useTranslations("Tickets.templateEditor");
	const templates = useQuery(trpc.tickets.templates.queryOptions());
	return <>
		<TicketHeading admin title={t("title")} description={t("description")} />
		<TicketError error={templates.error} />
		{templates.isPending ? <TicketLoading /> : templates.data && <TemplateForm initial={templates.data} baseCopies={baseCopies} />}
	</>;
}

function TemplateForm({ initial, baseCopies }: { initial: SavedTemplates; baseCopies: BaseCopies }) {
	const t = useTranslations("Tickets.templateEditor");
	const ticketT = useTranslations("Tickets");
	const mailT = useTranslations("Admin.mail");
	const notify = useTicketNotifications();
	const queryClient = useQueryClient();
	const appLocale = useLocale();
	const [config, setConfig] = useState(initial.config);
	const [saved, setSaved] = useState(initial);
	const [section, setSection] = useState<"artwork" | "email">("artwork");
	const [locale, setLocale] = useState<Locale>(appLocale === "en" ? "en" : "vi");
	const [category, setCategory] = useState<"normal" | "vip">("normal");
	const [validity, setValidity] = useState<"valid" | "revoked">("valid");
	const [source, setSource] = useState<"purchased" | "gifted">("purchased");
	const [quantity, setQuantity] = useState(1);
	const [mobile, setMobile] = useState(false);
	const [htmlMode, setHtmlMode] = useState(false);
	const [showText, setShowText] = useState(false);
	const [resetOpen, setResetOpen] = useState(false);
	const [preview, setPreview] = useState<{ key: string; result: Preview }>();
	const [previewError, setPreviewError] = useState<{ key: string; message: string }>();
	const [retry, setRetry] = useState(0);
	const dirty = JSON.stringify(config) !== JSON.stringify(saved.config);
	const previewKey = JSON.stringify({ config, locale, category, validity, source, quantity });
	const currentPreview = preview?.key === previewKey ? preview.result : undefined;
	const currentError = previewError?.key === previewKey ? previewError : undefined;
	const validConfig = ticketTemplateInput.safeParse(config).success;
	const bodyKey = source === "purchased" ? "purchaseBody" : "giftBody";
	const body = config.locales[locale][bodyKey];
	const appearance = config[section];
	const baseCopy = baseCopies[locale];

	useEffect(() => {
		if (!dirty) return;
		const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);

	useEffect(() => {
		if (!validConfig) return;
		const controller = new AbortController();
		const timer = window.setTimeout(async () => {
			try {
				const response = await fetch("/api/admin/tickets/templates/preview", {
					method: "POST", headers: { "Content-Type": "application/json" }, body: previewKey, signal: controller.signal,
				});
				const result = await response.json();
				if (!response.ok) throw new Error(result.message ?? "operationFailed");
				if (!controller.signal.aborted) { setPreview({ key: previewKey, result }); setPreviewError(undefined); }
			} catch (error) {
				if (!controller.signal.aborted) setPreviewError({ key: previewKey, message: error instanceof Error ? error.message : "operationFailed" });
			}
		}, 650);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [previewKey, validConfig, retry]);

	const save = useMutation(trpc.tickets.saveTemplates.mutationOptions({
		onSuccess: result => {
			setConfig(result.config); setSaved(result); setHtmlMode(false);
			queryClient.setQueryData(trpc.tickets.templates.queryKey(), result);
			notify.success(t("saved"));
		},
		onError: notify.error,
	}));
	const setAppearance = (patch: Partial<Config["artwork"]> | Partial<Config["email"]>) => setConfig(current => ({ ...current, [section]: { ...current[section], ...patch } }));
	const setCopy = (key: CopyKey, value: string) => setConfig(current => {
		const copy = { ...current.locales[locale].copy };
		if (value) copy[key] = value; else delete copy[key];
		return { ...current, locales: { ...current.locales, [locale]: { ...current.locales[locale], copy } } };
	});
	const setBody = (value: string) => setConfig(current => ({ ...current, locales: { ...current.locales, [locale]: { ...current.locales[locale], [bodyKey]: value } } }));
	const copyField = (key: CopyKey) => <label key={key}>
		{t(`copy.${key}`)}
		<Textarea rows={templateCopyLimit(key) > 120 ? 3 : 2} maxLength={templateCopyLimit(key)}
			value={config.locales[locale].copy[key] ?? ""} placeholder={baseCopy[key]}
			onChange={event => setCopy(key, event.target.value)} />
	</label>;
	const download = () => {
		if (!currentPreview) return;
		const link = document.createElement("a");
		link.href = currentPreview.png; link.download = `ticket-preview-${locale}-${category}.png`; link.click();
	};

	return <>
		<div className="ticket-template-savebar">
			<p role="status">{dirty ? t("unsaved") : t("upToDate")}</p>
			<div className="ticket-actions">
				<Button type="button" className="ticket-button-neutral" disabled={!dirty || save.isPending} onClick={() => { setConfig(saved.config); setHtmlMode(false); save.reset(); }}>{t("discard")}</Button>
				<Button type="button" className="ticket-button-neutral" disabled={save.isPending} onClick={() => setResetOpen(true)}><RotateCcwIcon aria-hidden="true" />{t("restore")}</Button>
				<Button type="button" className="ticket-button-success" disabled={!dirty || save.isPending || !currentPreview || !!currentError} onClick={() => save.mutate({ config, revision: saved.revision })}><SaveIcon aria-hidden="true" />{save.isPending ? t("saving") : t("save")}</Button>
			</div>
		</div>
		<TicketError error={save.error} />
		{save.error?.message === "templatesChanged" && <p className="ticket-warning">{t("conflictHelp")}</p>}
		<p className="ticket-warning">{t("applyHelp")}</p>
		<div className="ticket-template-layout">
			<div>
				<div className="ticket-actions" role="group" aria-label={t("templateChoice")}>
					{(["artwork", "email"] as const).map(value => <Button key={value} type="button" className="ticket-button-neutral" aria-pressed={section === value} onClick={() => setSection(value)}>{t(value)}</Button>)}
				</div>
				<fieldset disabled={save.isPending} className="ticket-template-fields">
					<section className="ticket-panel">
						<h2>{t("appearance")}</h2>
						<div className="ticket-form-grid">
							<label className="ticket-field-full">{t("brand")}<Input value={appearance.brand} maxLength={40} onChange={event => setAppearance({ brand: event.target.value })} /></label>
							<label>{t("font")}<select value={appearance.headingFont} onChange={event => setAppearance({ headingFont: event.target.value as "serif" | "sans" })}><option value="serif">{t("serif")}</option><option value="sans">{t("sans")}</option></select></label>
							<label>{t("titleSize")}<Input type="number" value={appearance.titleSize} min={section === "artwork" ? 28 : 24} max={section === "artwork" ? 48 : 40} onChange={event => setAppearance({ titleSize: Number(event.target.value) })} /></label>
							<label>{t("bodySize")}<Input type="number" value={appearance.bodySize} min={section === "artwork" ? 18 : 12} max={section === "artwork" ? 26 : 18} onChange={event => setAppearance({ bodySize: Number(event.target.value) })} /></label>
							{section === "email" && <label>{t("emailWidth")}<Input type="number" min={480} max={800} value={config.email.width} onChange={event => setAppearance({ width: Number(event.target.value) })} /></label>}
						</div>
						<details open><summary>{t("colors")}</summary><div className="ticket-template-colors">
							{(section === "artwork" ? artworkColors : emailColors).map(key => <label key={key} className="ticket-template-color">
								<span>{t(`palette.${key}`)}</span><input type="color" value={appearance.palette[key]} onChange={event => setAppearance({ palette: { ...appearance.palette, [key]: event.target.value } })} /><code>{appearance.palette[key]}</code>
							</label>)}
						</div></details>
						{section === "artwork" && <p>{t("qrHelp")}</p>}
					</section>
					<section className="ticket-panel">
						<h2>{t("content")}</h2>
						<label>{t("language")}<select value={locale} onChange={event => setLocale(event.target.value as Locale)}><option value="en">{t("english")}</option><option value="vi">{t("vietnamese")}</option></select></label>
						<p>{t("copyHelp")}</p>
						{section === "email" && <>
							<div className="ticket-form-grid">{copyField(source === "purchased" ? "subject" : "giftSubject")}{copyField(source === "purchased" ? "intro" : "giftIntro")}</div>
							<h3>{t("message")}</h3>
							<p>{t("messageHelp")}</p>
							<div className="ticket-actions"><Button type="button" className="ticket-button-neutral" aria-pressed={htmlMode} disabled={htmlMode && !currentPreview} onClick={() => {
								if (htmlMode && currentPreview) setConfig(currentPreview.config);
								setHtmlMode(!htmlMode);
							}}><CodeIcon aria-hidden="true" />{htmlMode ? t("visualEditor") : t("htmlEditor")}</Button>
							<Button type="button" className="ticket-button-neutral" disabled={!body} onClick={() => setBody("")}>{t("defaultMessage")}</Button></div>
							{htmlMode ? <label>{t("htmlEditor")}<Textarea className="ticket-template-source" rows={12} value={body} maxLength={20_000} onChange={event => setBody(event.target.value)} /></label> :
								<RichTextEditor key={`${locale}-${bodyKey}`} id="ticket-email-body" ariaLabel={t("message")} value={body} maxLength={20_000} onChange={setBody} disabled={save.isPending} tabIndentsLists={false}
									labels={{ toolbar: mailT("richText.toolbar"), bold: mailT("richText.bold"), italic: mailT("richText.italic"), underline: mailT("richText.underline"), unorderedList: mailT("richText.unorderedList"), orderedList: mailT("richText.orderedList"), link: mailT("richText.link"), linkTitle: mailT("richText.linkTitle"), linkDescription: mailT("richText.linkDescription"), linkUrl: mailT("richText.linkUrl"), linkPlaceholder: mailT("richText.linkPlaceholder"), linkInvalid: mailT("richText.linkInvalid"), linkApply: mailT("richText.linkApply"), linkRemove: mailT("richText.linkRemove"), cancel: mailT("cancel") }} />}
							<p>{t("variablesHelp")}</p><div className="ticket-template-variables">{emailTemplateVariables.map(variable => <Button type="button" className="ticket-button-neutral" key={variable} title={t(`variables.${variable}`)} onClick={() => setBody(`${body}<p>{{${variable}}}</p>`)}><code>{`{{${variable}}}`}</code></Button>)}</div>
							<p>{t("giftVariablesHelp")}</p>
							<details><summary>{t("emailLabels")}</summary><div className="ticket-form-grid">{emailCopyKeys.filter(key => !["subject", "giftSubject", "intro", "giftIntro"].includes(key)).map(copyField)}</div></details>
						</>}
						<details open={section === "artwork"}><summary>{t("sharedLabels")}</summary><p>{t("sharedHelp")}</p><div className="ticket-form-grid">{artworkCopyKeys.map(copyField)}</div></details>
					</section>
				</fieldset>
			</div>
			<aside className="ticket-panel ticket-template-preview" aria-label={t("preview")} tabIndex={0}>
				<h2><EyeIcon aria-hidden="true" />{t("preview")}</h2><p>{t("sampleHelp")}</p>
				<div className="ticket-form-grid">
					<label>{t("delivery")}<select value={source} onChange={event => { setSource(event.target.value as "purchased" | "gifted"); }}><option value="purchased">{t("purchased")}</option><option value="gifted">{t("gifted")}</option></select></label>
					<label>{ticketT("category")}<select value={category} onChange={event => { setCategory(event.target.value as "normal" | "vip"); setQuantity(1); }}><option value="normal">{t("copy.normal")}</option><option value="vip">{t("copy.vip")}</option></select></label>
					<label>{ticketT("validityLabel")}<select value={validity} onChange={event => setValidity(event.target.value as "valid" | "revoked")}><option value="valid">{ticketT("validity.valid")}</option><option value="revoked">{ticketT("validity.revoked")}</option></select></label>
					{source === "purchased" && category === "normal" && <label>{t("ticketQuantity")}<select value={quantity} onChange={event => setQuantity(Number(event.target.value))}>{[1, 2, 3].map(value => <option value={value} key={value}>{value}</option>)}</select></label>}
				</div>
				<div className="ticket-actions">{section === "artwork" ? <Button type="button" className="ticket-button-neutral" disabled={!currentPreview} onClick={download}><DownloadIcon aria-hidden="true" />{t("download")}</Button> : <>
					<Button type="button" className="ticket-button-neutral" aria-pressed={mobile} onClick={() => setMobile(!mobile)}>{mobile ? t("desktop") : t("mobile")}</Button>
					<Button type="button" className="ticket-button-neutral" aria-pressed={showText} onClick={() => setShowText(!showText)}>{showText ? t("htmlPreview") : t("plainText")}</Button>
				</>}</div>
				<p role="status" aria-live="polite" className="ticket-template-status">{currentPreview ? <><CheckIcon aria-hidden="true" />{t("previewReady")}</> : currentError || !validConfig ? t("previewInvalid") : t("previewUpdating")}</p>
				{!validConfig && <TicketError error={{ message: "invalidTemplateConfig" }} />}<TicketError error={currentError} />
				{currentError && <Button type="button" className="ticket-button-neutral" onClick={() => { setPreviewError(undefined); setRetry(value => value + 1); }}>{ticketT("retry")}</Button>}
				{preview && <div className="ticket-template-render" aria-busy={!currentPreview && !currentError && validConfig} data-stale={!currentPreview || undefined}>
					{section === "artwork" ? <img className="ticket-artwork" src={preview.result.png} alt={t("artworkAlt")} /> : <>
						<p><strong>{t("subject")}</strong> {preview.result.subject}</p>
						{showText ? <pre className="ticket-template-text">{preview.result.text}</pre> : <iframe sandbox="" referrerPolicy="no-referrer" title={t("emailFrame")} srcDoc={preview.result.html} style={{ width: mobile ? "min(100%, 375px)" : "100%" }} />}
						<details><summary>{t("generatedHtml")}</summary><Textarea readOnly value={preview.result.html} className="ticket-template-source" rows={12} aria-label={t("generatedHtml")} /></details>
						<p>{t("attachmentHelp")}</p><img className="ticket-artwork ticket-template-attachment" src={preview.result.png} alt={t("artworkAlt")} />
					</>}
				</div>}
			</aside>
		</div>
		<Dialog open={resetOpen} onOpenChange={setResetOpen}><DialogContent><DialogHeader><DialogTitle>{t("restore")}</DialogTitle><DialogDescription>{t("restoreHelp")}</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setResetOpen(false)}>{mailT("cancel")}</Button><Button type="button" onClick={() => { setConfig(structuredClone(defaultTicketTemplates)); setHtmlMode(false); setResetOpen(false); }}>{t("restore")}</Button></DialogFooter></DialogContent></Dialog>
	</>;
}
