"use client";

import { Button } from "@masc-landing/ui/components/button";
import { useTranslations } from "next-intl";
import { Skeleton } from "@masc-landing/ui/components/skeleton";
import { ArrowLeftIcon, ArrowRightIcon, AlertCircleIcon, TicketIcon } from "lucide-react";
import { AdminHeading } from "@/app/admin/admin-state";

export function TicketHeading({ title, description, admin = false, action }: { title: string; description?: string; admin?: boolean; action?: React.ReactNode }) {
	const t = useTranslations("Tickets");
	const adminT = useTranslations("Admin");
	return <div className={admin ? "admin-heading-actions ticket-page-heading" : "dashboard-heading-row ticket-page-heading"}>
		{admin ? <AdminHeading eyebrow={adminT("eyebrow")} title={title} description={description} /> : <div className="dashboard-heading"><p className="dashboard-eyebrow">{t("eyebrow")}</p><h1>{title}</h1>{description && <p>{description}</p>}</div>}
		{action}
	</div>;
}

export function TicketLoading() {
	const t = useTranslations("Tickets");
	return <div className="ticket-loading" role="status"><span className="sr-only">{t("loading")}</span><Skeleton className="h-12 w-2/3" /><div className="ticket-grid"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div></div>;
}

export function TicketEmpty({ message }: { message: string }) {
	return <div className="ticket-empty"><TicketIcon aria-hidden="true" /><p>{message}</p></div>;
}

export function TicketError({ error }: { error: { message: string } | null | undefined }) {
	const t = useTranslations("Tickets");
	if (!error) return null;
	return <div className="ticket-error" role="alert"><AlertCircleIcon aria-hidden="true" /><p>{t.has(`errors.${error.message}`) ? t(`errors.${error.message}`) : t("errors.operationFailed")}</p></div>;
}

export function Pagination({ page, total, pageSize, setPage }: { page: number; total: number; pageSize: number; setPage: (page: number) => void }) {
	const t = useTranslations("Tickets");
	return <nav className="ticket-pagination" aria-label={t("pagination")}><Button type="button" variant="outline" onClick={() => setPage(page - 1)} disabled={!page}><ArrowLeftIcon aria-hidden="true" />{t("previous")}</Button><span>{t("page", { page: page + 1, total })}</span><Button type="button" variant="outline" onClick={() => setPage(page + 1)} disabled={(page + 1) * pageSize >= total}>{t("next")}<ArrowRightIcon aria-hidden="true" /></Button></nav>;
}
