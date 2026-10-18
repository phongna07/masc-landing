import Link from "next/link";
import { getTranslations } from "next-intl/server";
import LanguageSwitcher from "@/components/language-switcher";
import UserMenu from "@/components/user-menu";
import { BrandLogo } from "@/components/hero-brand-logo";
import TicketNavigation from "./ticket-navigation";
import "./tickets.css";

export default async function TicketShell({ children, showNavigation = true }: { children: React.ReactNode; showNavigation?: boolean }) {
	const t = await getTranslations("Dashboard");
	const ticketT = await getTranslations("Tickets");
	return <div className="dashboard-page ticket-page">
		<header className="dashboard-navbar ticket-navbar">
			<Link className="brand" href="/" aria-label={t("nav.homeLabel")}>
				<BrandLogo className="brand-logo" />
				<span className="brand-copy">Marketing All-Star Challenge 2026<br /><small>HYPERNOVA</small></span>
			</Link>
			<div className="dashboard-nav-actions"><Link href="/dashboard" className="language-trigger">{ticketT("dashboard")}</Link><LanguageSwitcher /><UserMenu /></div>
		</header>
		{showNavigation && <div className="ticket-nav-container"><TicketNavigation /></div>}
		<main className="dashboard-main ticket-main">{children}</main>
	</div>;
}
