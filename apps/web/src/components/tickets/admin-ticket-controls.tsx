"use client";

import { BanIcon, RefreshCwIcon, SaveIcon, SendIcon } from "lucide-react";

import { useTicketNotifications } from "@/components/tickets/use-ticket-notifications";
import { Button } from "@masc-landing/ui/components/button";
import { Textarea } from "@masc-landing/ui/components/textarea";
import { Input } from "@masc-landing/ui/components/input";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { trpc } from "@/utils/trpc";
import { TicketError } from "./ticket-ui";
import type { TicketRecord } from "./ticket-card";

export default function AdminTicketControls({ ticket, refresh }: { ticket: TicketRecord; refresh: () => void }) {
	const t = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const locale = useLocale();
	const [reason, setReason] = useState("");
	const [recipient, setRecipient] = useState({ recipientName: ticket.recipientName ?? "", recipientPhone: ticket.recipientPhone ?? "", recipientEmail: ticket.recipientEmail ?? "" });
	const change = useMutation(trpc.tickets.changeTicket.mutationOptions({ onSuccess: (_result, input) => { notify.success(t(`notifications.${input.action === "revoke" ? "revoked" : "replaced"}`)); refresh(); }, onError: notify.error }));
	const update = useMutation(trpc.tickets.recipient.mutationOptions({ onSuccess: () => { notify.success(t("notifications.recipientSaved")); refresh(); }, onError: notify.error }));
	const deliver = useMutation(trpc.tickets.deliver.mutationOptions({ onSuccess: () => { notify.info(t("notifications.emailQueued")); refresh(); }, onError: notify.error }));
	return <details><summary>{t("manageTicket")}</summary><p>{t("affectedTicket", { ordinal: ticket.ordinal, id: ticket.id })}</p><label>{t("reason")}<Textarea maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
		<div className="ticket-actions">{ticket.source === "gifted" && <Button className="ticket-button-danger" type="button" variant="destructive" disabled={!reason.trim() || change.isPending || ticket.validity === "revoked"} onClick={() => change.mutate({ ticketId: ticket.id, action: "revoke", reason })}><BanIcon aria-hidden="true" />{t("revoke")}</Button>}<Button className="ticket-button-warning" type="button" variant="outline" disabled={!reason.trim() || change.isPending || ticket.validity !== "valid"} onClick={() => change.mutate({ ticketId: ticket.id, action: "replace", reason })}><RefreshCwIcon aria-hidden="true" />{t("replace")}</Button></div><p>{t(ticket.source === "purchased" ? "purchasedReplacementHelp" : "replacementHelp")}</p>
		{ticket.source === "gifted" && <><form className="ticket-recipient-form" onSubmit={e => { e.preventDefault(); update.mutate({ ticketId: ticket.id, ...recipient }); }}><h3>{t("optionalRecipient")}</h3>{(["recipientName", "recipientPhone", "recipientEmail"] as const).map(key => <label key={key}>{t(key)}<Input type={key === "recipientEmail" ? "email" : key === "recipientPhone" ? "tel" : "text"} value={recipient[key]} onChange={e => setRecipient({ ...recipient, [key]: e.target.value })} maxLength={key === "recipientPhone" ? 40 : 120} /></label>)}<Button className="ticket-button-success" type="submit" disabled={update.isPending}><SaveIcon aria-hidden="true" />{t("saveRecipient")}</Button></form><Button className="ticket-button-utility" type="button" disabled={!ticket.recipientEmail || deliver.isPending} onClick={() => deliver.mutate({ ticketId: ticket.id, requestKey: crypto.randomUUID(), locale: locale === "en" ? "en" : "vi" })}><SendIcon aria-hidden="true" />{t("sendGiftEmail")}</Button><p>{t("giftEmailHelp")}</p></>}
		<TicketError error={change.error || update.error || deliver.error} />
	</details>;
}
