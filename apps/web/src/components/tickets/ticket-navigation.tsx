"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const buyerLinks = [{ href: "/tickets", key: "buy" }, { href: "/my-tickets", key: "myTickets" }, { href: "/dashboard", key: "dashboard" }] as const;
const adminLinks = [{ href: "/admin/tickets", key: "overview" }, { href: "/admin/tickets/purchased", key: "purchased" }, { href: "/admin/tickets/gifted", key: "gifted" }, { href: "/admin/check-in", key: "checkIn" }, { href: "/admin/tickets/check-in-logs", key: "checkInLogs" }, { href: "/admin/tickets/templates", key: "templates" }] as const;

export default function TicketNavigation({ admin = false }: { admin?: boolean }) {
	const t = useTranslations("Tickets");
	const pathname = usePathname();
	return <nav className="ticket-tabs" aria-label={t("navigation")}>
		{(admin ? adminLinks : buyerLinks).map(({ href, key }) => {
			const active = pathname === href || (href !== "/admin/tickets" && pathname.startsWith(`${href}/`));
			return <Link key={href} href={href as Route} aria-current={active ? "page" : undefined}>{t(key)}</Link>;
		})}
	</nav>;
}
