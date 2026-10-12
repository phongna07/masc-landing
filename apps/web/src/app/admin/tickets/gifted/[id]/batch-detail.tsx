"use client";

import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { Button } from "@masc-landing/ui/components/button";
import { Input } from "@masc-landing/ui/components/input";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { trpc } from "@/utils/trpc";
import TicketCard, { type TicketRecord } from "@/components/tickets/ticket-card";
import AdminTicketControls from "@/components/tickets/admin-ticket-controls";
import { TicketHeading, TicketLoading, TicketError } from "@/components/tickets/ticket-ui";

export default function GiftBatchDetail({ id }: { id: string }) {
	const t = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const locale = useLocale();
	const detail = useQuery(trpc.tickets.batchDetail.queryOptions({ id }));
	const [printSheet, setPrintSheet] = useState(false);
	const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
	const [imageError, setImageError] = useState(false);
	const readyNotification = useRef<string | null>(null);
	const [validity, setValidity] = useState("");
	const [recipientSearch, setRecipientSearch] = useState("");
	const [delivery, setDelivery] = useState("");
	const refresh = () => { void detail.refetch(); };
	const tickets = detail.data?.tickets.filter(ticket => (!validity || ticket.validity === validity) && (!recipientSearch || ticket.recipientName?.toLowerCase().includes(recipientSearch.toLowerCase()) || ticket.recipientEmail?.toLowerCase().includes(recipientSearch.toLowerCase())) && (!delivery || detail.data?.jobs.some(j => j.ticketId === ticket.id && j.status === delivery))) ?? [];
	const imageKey = (ticket: TicketRecord) => `${ticket.id}:${ticket.credentialVersion}:${ticket.validity}:${locale}`;
	const sheetKey = tickets.map(imageKey).join("|");
	const sheetReady = tickets.length > 0 && tickets.every(ticket => loadedImages.has(imageKey(ticket)));
	useEffect(() => {
		if (printSheet && sheetReady && !imageError && readyNotification.current !== sheetKey) {
			readyNotification.current = sheetKey;
			notify.success(t("notifications.sheetReady"), { id: "ticket-sheet" });
		}
	}, [printSheet, sheetReady, imageError, sheetKey, notify, t]);
	return <><TicketHeading admin title={detail.data?.batch.title ?? t("batchDetails")} description={t("batchDetailsIntro")} /><TicketError error={detail.error} />{detail.isPending && <TicketLoading />}{detail.data && <><p>{t(`categories.${detail.data.batch.category}`)} · {t("quantity", { count: detail.data.batch.quantity })}</p><p>{t("internalNote")}: {detail.data.batch.note || "—"}</p><p className="ticket-warning">{t("confidential")}</p><Button type="button" disabled={printSheet || !tickets.length} onClick={() => { readyNotification.current = null; setLoadedImages(new Set()); setImageError(false); setPrintSheet(true); notify.info(t("notifications.sheetPreparing"), { id: "ticket-sheet" }); }}>{t("prepareSheet")}</Button>
			{printSheet && <><p>{t("printHelp")}</p><div className="ticket-actions"><Button type="button" disabled={imageError || !sheetReady} onClick={() => { notify.info(t("notifications.printOpened")); window.print(); }}>{t("printSheet")}</Button><Button type="button" onClick={() => { setPrintSheet(false); notify.dismiss("ticket-sheet"); }}>{t("hide")}</Button></div>{imageError && <p role="alert">{t("errors.imageFailed")}</p>}<div className="ticket-print-sheet">{tickets.map(ticket => <img key={imageKey(ticket)} src={`/api/tickets/${ticket.id}/image?locale=${locale}&v=${ticket.credentialVersion}&validity=${ticket.validity}`} alt={t("imageAlt")} onLoad={() => setLoadedImages(previous => new Set(previous).add(imageKey(ticket)))} onError={() => { setImageError(true); notify.error({ message: "imageFailed" }); notify.dismiss("ticket-sheet"); }} />)}</div></>}
			<div className="ticket-grid ticket-filters"><label>{t("validityLabel")}<select value={validity} onChange={e => setValidity(e.target.value)}><option value="">{t("all")}</option>{["valid", "revoked"].map(key => <option key={key} value={key}>{t(`validity.${key}`)}</option>)}</select></label><label>{t("recipientSearch")}<Input value={recipientSearch} onChange={e => setRecipientSearch(e.target.value)} /></label><label>{t("emailDelivery")}<select value={delivery} onChange={e => setDelivery(e.target.value)}><option value="">{t("all")}</option>{["pending", "sending", "sent", "failed"].map(key => <option key={key} value={key}>{t(`emailStatus.${key}`)}</option>)}</select></label></div>
			<div className="ticket-grid">{tickets.map(ticket => <TicketCard root key={`${ticket.id}:${ticket.credentialVersion}`} ticket={ticket}><p>{ticket.recipientName || "—"} · {ticket.recipientEmail || "—"}</p>{detail.data.jobs.filter(j => j.ticketId === ticket.id).map(job => <p key={job.id}>{t(`emailStatus.${job.status}`)} · {t("attempts", { count: job.attempts })}</p>)}<AdminTicketControls ticket={ticket} refresh={refresh} /></TicketCard>)}</div>
		</>}
	</>;
}
