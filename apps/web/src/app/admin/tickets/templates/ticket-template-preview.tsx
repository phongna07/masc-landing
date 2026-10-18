"use client";

import type { previewTicketTemplates } from "@masc-landing/api/tickets/template-preview";
import { Button } from "@masc-landing/ui/components/button";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { CheckIcon, DownloadIcon, EyeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { TicketError, TicketHeading } from "@/components/tickets/ticket-ui";

type Preview = Awaited<ReturnType<typeof previewTicketTemplates>>;

export default function TicketTemplatePreview() {
	const t = useTranslations("Tickets.templatePreview");
	const ticketT = useTranslations("Tickets");
	const [section, setSection] = useState<"artwork" | "email">("artwork");
	const [category, setCategory] = useState<"normal" | "vip">("normal");
	const [validity, setValidity] = useState<"valid" | "revoked">("valid");
	const [source, setSource] = useState<"purchased" | "gifted">("purchased");
	const [quantity, setQuantity] = useState(1);
	const [mobile, setMobile] = useState(false);
	const [showText, setShowText] = useState(false);
	const [preview, setPreview] = useState<{ key: string; result: Preview }>();
	const [previewError, setPreviewError] = useState<{ key: string; message: string }>();
	const [retry, setRetry] = useState(0);

	const previewKey = JSON.stringify({ category, validity, source, quantity });
	const currentPreview = preview?.key === previewKey ? preview.result : undefined;
	const currentError = previewError?.key === previewKey ? previewError : undefined;

	useEffect(() => {
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
		}, 150);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [previewKey, retry]);

	const download = () => {
		if (!currentPreview) return;
		const link = document.createElement("a");
		link.href = currentPreview.png; link.download = `ticket-preview-vi-${category}.png`; link.click();
	};

	return <>
		<TicketHeading admin title={t("title")} description={t("description")} />
		<section className="ticket-panel ticket-template-preview" aria-label={t("preview")} tabIndex={0}>
			<h2><EyeIcon aria-hidden="true" />{t("preview")}</h2><p>{t("sampleHelp")}</p>
			<div className="ticket-actions ticket-template-choice" role="group" aria-label={t("templateChoice")}>
				{(["artwork", "email"] as const).map(value => <Button key={value} type="button" className="ticket-button-neutral" aria-pressed={section === value} onClick={() => setSection(value)}>{t(value)}</Button>)}
			</div>
			<div className="ticket-form-grid">
				<label>{t("delivery")}<select value={source} onChange={event => { setSource(event.target.value as "purchased" | "gifted"); setQuantity(1); }}><option value="purchased">{t("purchased")}</option><option value="gifted">{t("gifted")}</option></select></label>
				<label>{ticketT("category")}<select value={category} onChange={event => { setCategory(event.target.value as "normal" | "vip"); setQuantity(1); }}><option value="normal">{t("copy.normal")}</option><option value="vip">{t("copy.vip")}</option></select></label>
				<label>{ticketT("validityLabel")}<select value={validity} onChange={event => setValidity(event.target.value as "valid" | "revoked")}><option value="valid">{ticketT("validity.valid")}</option><option value="revoked">{ticketT("validity.revoked")}</option></select></label>
				{source === "purchased" && category === "normal" && <label>{t("ticketQuantity")}<select value={quantity} onChange={event => setQuantity(Number(event.target.value))}>{[1, 2, 3].map(value => <option value={value} key={value}>{value}</option>)}</select></label>}
			</div>
			<div className="ticket-actions">{section === "artwork" ? <Button type="button" className="ticket-button-neutral" disabled={!currentPreview} onClick={download}><DownloadIcon aria-hidden="true" />{t("download")}</Button> : <>
				<Button type="button" className="ticket-button-neutral" aria-pressed={mobile} onClick={() => setMobile(!mobile)}>{mobile ? t("desktop") : t("mobile")}</Button>
				<Button type="button" className="ticket-button-neutral" aria-pressed={showText} onClick={() => setShowText(!showText)}>{showText ? t("htmlPreview") : t("plainText")}</Button>
			</>}</div>
			<p role="status" aria-live="polite" className="ticket-template-status">{currentPreview ? <><CheckIcon aria-hidden="true" />{t("previewReady")}</> : currentError ? t("previewInvalid") : t("previewUpdating")}</p>
			<TicketError error={currentError} />
			{currentError && <Button type="button" className="ticket-button-neutral" onClick={() => { setPreviewError(undefined); setRetry(value => value + 1); }}>{ticketT("retry")}</Button>}
			{preview && <div className="ticket-template-render" aria-busy={!currentPreview && !currentError} data-stale={!currentPreview || undefined}>
				{section === "artwork" ? <img className="ticket-artwork" src={preview.result.png} alt={t("artworkAlt")} /> : <>
					<p><strong>{t("subject")}</strong> {preview.result.subject}</p>
					{showText ? <pre className="ticket-template-text">{preview.result.text}</pre> : <iframe sandbox="" referrerPolicy="no-referrer" title={t("emailFrame")} srcDoc={preview.result.html} style={{ width: mobile ? "min(100%, 375px)" : "100%" }} />}
					<details><summary>{t("generatedHtml")}</summary><Textarea readOnly value={preview.result.html} className="ticket-template-source" rows={12} aria-label={t("generatedHtml")} /></details>
					<p>{t("attachmentHelp")}</p><img className="ticket-artwork ticket-template-attachment" src={preview.result.png} alt={t("artworkAlt")} />
				</>}
			</div>}
		</section>
	</>;
}
