"use client";

import { Button } from "@masc-landing/ui/components/button";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@masc-landing/api/routers/index";
import { trpc } from "@/utils/trpc";
import { DownloadIcon, EyeIcon, EyeOffIcon, ShieldAlertIcon } from "lucide-react";
import { Pagination, TicketError } from "./ticket-ui";
import { useTicketNotifications } from "./use-ticket-notifications";
import { useTicketDownload } from "./use-ticket-download";

export type TicketRecord = inferRouterOutputs<AppRouter>["tickets"]["order"]["tickets"][number];
export function TicketTime({ value }: { value: string | Date }) {
	const locale = useLocale();
	return <time dateTime={new Date(value).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value))} (UTC+7)</time>;
}

export function TicketHistory({ id, root = false }: { id: string; root?: boolean }) {
	const t = useTranslations("Tickets");
	const [page, setPage] = useState(0);
	const ownerHistory = useQuery({ ...trpc.tickets.history.queryOptions({ id, page }), enabled: !root });
	const adminHistory = useQuery({ ...trpc.tickets.adminHistory.queryOptions({ id, page }), enabled: root });
	const history = root ? adminHistory.data?.checkIns : ownerHistory.data?.checkIns;
	const total = root ? Math.max(adminHistory.data?.checkInTotal ?? 0, adminHistory.data?.actionTotal ?? 0) : ownerHistory.data?.total ?? 0;
	return <div className="ticket-history">{(root ? adminHistory.isError : ownerHistory.isError) && <TicketError error={{ message: "operationFailed" }} />}{history?.length === 0 && <p>{t("noHistory")}</p>}{history?.map((event, i) => {
		const adminEvent = root ? adminHistory.data?.checkIns[i] : undefined;
		return <p key={adminEvent?.id ?? i}><strong>{t(`outcomes.${event.outcome}`)}</strong> · <TicketTime value={event.createdAt} />{event.isOverride && <> · {t("override")}</>}{adminEvent && <> · {t("reason")}: {t.has(`scan.${adminEvent.reason}`) ? t(`scan.${adminEvent.reason}`) : adminEvent.reason} · {t("actor")}: {adminEvent.actorId}</>}</p>;
	})}{root && adminHistory.data?.actions.map(action => <p key={action.id}>{t.has(`audit.${action.action}`) ? t(`audit.${action.action}`) : action.action} · {action.reason} · {t("actor")}: {action.actorId} · <TicketTime value={action.createdAt} /></p>)}{total > 50 && <Pagination page={page} total={total} pageSize={50} setPage={setPage} />}</div>;
}

export default function TicketCard({ ticket, root = false, children }: { ticket: TicketRecord; root?: boolean; children?: React.ReactNode }) {
	const t = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const { download, isDownloading } = useTicketDownload();
	const locale = useLocale();
	const [open, setOpen] = useState(false);
	const [imageError, setImageError] = useState(false);
	const imageUrl = `/api/tickets/${ticket.id}/image?locale=${locale}&v=${ticket.credentialVersion}&validity=${ticket.validity}`;
	return <article className={`ticket-card ${ticket.category === "vip" ? "ticket-card-vip" : ""} ${ticket.validity === "revoked" ? "ticket-revoked" : ""}`}>
		<div className="ticket-actions ticket-card-heading"><h3>{t(`categories.${ticket.category}`)} · #{ticket.ordinal}</h3><span className={`ticket-badge ticket-badge-${ticket.validity}`}>{t(`validity.${ticket.validity}`)}</span></div>
		<div className="ticket-card-body"><div className="ticket-details">
		{ticket.benefits.includes("networkingLunch") && <p className="ticket-benefit">{t("networkingLunch")}</p>}
		<p>{t("acceptedCount", { count: ticket.acceptedCount })}</p>
		</div><div className="ticket-card-access"><p className="ticket-warning"><ShieldAlertIcon aria-hidden="true" className="ticket-inline-icon" />{t("confidential")}</p>
		<Button type="button" variant="outline" onClick={() => { setOpen(!open); if (!open) notify.warning(t("confidential"), { id: `ticket-view:${ticket.id}` }); else notify.dismiss(`ticket-view:${ticket.id}`); }} aria-expanded={open}>{open ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}{t(open ? "hide" : "view")}</Button></div></div>
		{open && <div className="ticket-credential"><div className="ticket-credential-heading"><strong>{t("code")}</strong>
			<Button className="ticket-button-utility" type="button" disabled={isDownloading} aria-busy={isDownloading} onClick={() => void download(`${imageUrl}&download=1`, `ticket-${ticket.ordinal}.png`, "image/png", "imageFailed")} variant="outline"><DownloadIcon aria-hidden="true" />{t("savePng")}</Button>
			</div><code className="ticket-code">{ticket.code}</code><p className="ticket-section-label">{t("admissionQr")}</p>{imageError ? <TicketError error={{ message: "imageFailed" }} /> : <img className="ticket-artwork" src={imageUrl} alt={t("imageAlt")} onError={() => { setImageError(true); notify.error({ message: "imageFailed" }); }} />}
			<details><summary>{t("history")}</summary><TicketHistory id={ticket.id} root={root} /></details>
		</div>}
		{children}
	</article>;
}
