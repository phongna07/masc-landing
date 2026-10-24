"use client";

import type { inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "@masc-landing/api/routers/index";
import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { trpc } from "@/utils/trpc";
import { TicketError } from "./ticket-ui";
import { useTicketNotifications } from "./use-ticket-notifications";

type SaleInput = inferRouterInputs<AppRouter>["salesLogs"]["create"];
const empty = { buyerName: "", buyerEmail: "", buyerPhone: "", category: "normal" as "normal" | "vip", quantity: 1, amountReceived: "" };
const imageTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export default function SalesLogForm({ onCreated }: { onCreated: (id: string) => void }) {
	const t = useTranslations("Tickets.sales");
	const ticketT = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const [form, setForm] = useState(empty);
	const [file, setFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<{ message: string } | null>(null);
	const [locked, setLocked] = useState(false);
	const request = useRef<SaleInput | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	const config = useQuery(trpc.salesLogs.config.queryOptions());
	const upload = useMutation(trpc.salesLogs.createUploadUrl.mutationOptions());
	const create = useMutation(trpc.salesLogs.create.mutationOptions());
	async function submit() {
		if (busy) return;
		setBusy(true); setError(null);
		try {
			if (!request.current) {
				if (!form.buyerName.trim()) throw new Error("invalidBuyerContact");
				let proof: SaleInput["proof"];
				if (file) {
					if (!imageTypes.includes(file.type as typeof imageTypes[number]) || file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error("invalidProof");
					const metadata = { filename: file.name, mimeType: file.type as typeof imageTypes[number], fileSize: file.size };
					const signed = await upload.mutateAsync(metadata);
					const response = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
					if (!response.ok) throw new Error("proofUploadFailed");
					proof = { ...metadata, uploadId: signed.uploadId };
				}
				request.current = { ...form, quantity: Number(form.quantity), amountReceived: Number(form.amountReceived), requestKey: crypto.randomUUID(), proof };
				setLocked(true);
			}
			const log = await create.mutateAsync(request.current);
			if (log.emailStatus === "sent") notify.success(t("created"));
			else if (log.emailStatus === "failed") notify.warning(t("createdEmailFailed"));
			else notify.info(t("createdEmailPending"));
			request.current = null; setLocked(false); setForm(empty); setFile(null);
			if (fileInput.current) fileInput.current.value = "";
			void config.refetch(); onCreated(log.id);
		} catch (failure) {
			const message = failure instanceof Error ? failure.message : "operationFailed";
			if (failure && typeof failure === "object" && "data" in failure && failure.data && typeof failure.data === "object" && "code" in failure.data && failure.data.code === "BAD_REQUEST") { request.current = null; setLocked(false); }
			setError({ message });
			if (["vipSoldOut", "invalidProof", "proofUploadFailed"].includes(message)) { request.current = null; setLocked(false); }
		} finally { setBusy(false); }
	}
	return <form className="ticket-panel" onSubmit={event => { event.preventDefault(); void submit(); }}>
		<h2>{t("create")}</h2><p>{t("formHelp")}</p>
		<fieldset disabled={busy || locked} className="ticket-form-grid sales-log-fieldset">
			<label>{t("buyerName")}<Input required maxLength={120} autoComplete="off" value={form.buyerName} onChange={e => setForm({ ...form, buyerName: e.target.value })} /></label>
			<label>{t("buyerEmail")}<Input type="email" required maxLength={254} autoComplete="off" value={form.buyerEmail} onChange={e => setForm({ ...form, buyerEmail: e.target.value })} /></label>
			<label>{t("buyerPhone")}<Input type="tel" maxLength={40} autoComplete="off" value={form.buyerPhone} onChange={e => setForm({ ...form, buyerPhone: e.target.value })} /></label>
			<label>{ticketT("category")}<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as typeof form.category })}>{["normal", "vip"].map(category => <option key={category} value={category}>{ticketT(`categories.${category}`)}</option>)}</select></label>
			<label>{t("quantity")}<Input type="number" required min={1} max={100} step={1} value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></label>
			<label>{t("amount")}<Input aria-describedby="sales-log-amount-help" type="number" required min={0} max={2000000000} step={1} value={form.amountReceived} onChange={e => setForm({ ...form, amountReceived: e.target.value })} /><span id="sales-log-amount-help">{t("freeAmountHelp")}</span></label>
			<label className="ticket-field-full">{t("proofOptional")}<Input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} /><span>{t("proofHelp")}</span></label>
		</fieldset>
		{config.data && <p>{t("vipAvailable", { count: config.data.vipAvailable })}</p>}
		{locked && !busy && <p className="ticket-warning">{t("retryCreationHelp")}</p>}
		<TicketError error={error || config.error} />
		<Button className="ticket-button-primary" type="submit" disabled={busy} aria-busy={busy}>{t(busy ? "submitting" : locked ? "retryCreate" : "submit")}</Button>
	</form>;
}
