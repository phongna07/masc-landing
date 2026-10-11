"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { trpc } from "@/utils/trpc";
import TicketCard from "@/components/tickets/ticket-card";
import AdminTicketControls from "@/components/tickets/admin-ticket-controls";
import { TicketHeading, TicketLoading, TicketError } from "@/components/tickets/ticket-ui";

export default function GiftBatchDetail({ id }: { id: string }) {
	const t = useTranslations("Tickets");
	const locale = useLocale();
	const detail = useQuery(trpc.tickets.batchDetail.queryOptions({ id }));
	const [printSheet, setPrintSheet] = useState(false);
	const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
	const [imageError, setImageError] = useState(false);
	const [validity, setValidity] = useState("");
	const [recipientSearch, setRecipientSearch] = useState("");
	const [delivery, setDelivery] = useState("");
	const refresh = () => { void detail.refetch(); };
	const tickets = detail.data?.tickets.filter(ticket => (!validity || ticket.validity === validity) && (!recipientSearch || ticket.recipientName?.toLowerCase().includes(recipientSearch.toLowerCase()) || ticket.recipientEmail?.toLowerCase().includes(recipientSearch.toLowerCase())) && (!delivery || detail.data?.jobs.some(j => j.ticketId === ticket.id && j.status === delivery))) ?? [];
	return <><TicketHeading admin title={detail.data?.batch.title ?? t("batchDetails")} description={t("batchDetailsIntro")} /><TicketError error={detail.error} />{detail.isPending && <TicketLoading />}{detail.data && <><p>{t(`categories.${detail.data.batch.category}`)} · {t("quantity", { count: detail.data.batch.quantity })}</p><p>{t("internalNote")}: {detail.data.batch.note || "—"}</p><p className="ticket-warning">{t("confidential")}</p><Button type="button" onClick={() => { setLoadedImages(new Set()); setImageError(false); setPrintSheet(true); }}>{t("prepareSheet")}</Button>
			{printSheet && <><p>{t("printHelp")}</p><div className="ticket-actions"><Button type="button" disabled={imageError || loadedImages.size < tickets.length} onClick={() => window.print()}>{t("printSheet")}</Button><Button type="button" onClick={() => setPrintSheet(false)}>{t("hide")}</Button></div>{imageError && <p role="alert">{t("errors.imageFailed")}</p>}<div className="ticket-print-sheet">{tickets.map(ticket => <img key={`${ticket.id}:${ticket.credentialVersion}`} src={`/api/tickets/${ticket.id}/image?locale=${locale}&v=${ticket.credentialVersion}`} alt={t("imageAlt")} onLoad={() => setLoadedImages(previous => new Set(previous).add(ticket.id))} onError={() => setImageError(true)} />)}</div></>}
			<div className="ticket-grid ticket-filters"><label>{t("validityLabel")}<select value={validity} onChange={e => setValidity(e.target.value)}><option value="">{t("all")}</option>{["valid", "revoked"].map(key => <option key={key} value={key}>{t(`validity.${key}`)}</option>)}</select></label><label>{t("recipientSearch")}<Input value={recipientSearch} onChange={e => setRecipientSearch(e.target.value)} /></label><label>{t("emailDelivery")}<select value={delivery} onChange={e => setDelivery(e.target.value)}><option value="">{t("all")}</option>{["pending", "sending", "sent", "failed"].map(key => <option key={key} value={key}>{t(`emailStatus.${key}`)}</option>)}</select></label></div>
			<div className="ticket-grid">{tickets.map(ticket => <TicketCard root key={`${ticket.id}:${ticket.credentialVersion}`} ticket={ticket}><p>{ticket.recipientName || "—"} · {ticket.recipientEmail || "—"}</p>{detail.data.jobs.filter(j => j.ticketId === ticket.id).map(job => <p key={job.id}>{t(`emailStatus.${job.status}`)} · {t("attempts", { count: job.attempts })}</p>)}<AdminTicketControls ticket={ticket} refresh={refresh} /></TicketCard>)}</div>
		</>}
	</>;
}
