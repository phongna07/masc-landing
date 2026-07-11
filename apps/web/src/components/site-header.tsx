"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { authClient } from "@/lib/auth-client";
import LanguageSwitcher from "@/components/language-switcher";

type SiteHeaderProps = {
  landingPage?: boolean;
};

export default function SiteHeader({ landingPage = false }: SiteHeaderProps) {
  const t = useTranslations("Home.header");
  const { data: session, isPending } = authClient.useSession();
  const homeHref = landingPage ? "#top" : "/";
  const sectionHref = (hash: string) => (landingPage ? hash : `/${hash}`);

  return (
    <header className="site-header">
      <a className="brand" href={homeHref} aria-label={t("backToTop")}>
        <span className="brand-mark">M</span>
        <span className="brand-copy">
          MASC
          <br />
          <small>SUPERNOVA &apos;26</small>
        </span>
      </a>
      <nav aria-label={t("navigationLabel")}>
        <a href={sectionHref("#about")}>{t("lookingBack")}</a>
        <a href={sectionHref("#journey")}>{t("videoChallenges")}</a>
        <a href={sectionHref("#news")}>{t("news")}</a>
      </nav>
      <div className="header-actions">
        {!isPending && (
          <Link className="header-login" href={session?.user ? "/dashboard" : "/login"}>
            {session?.user ? "Dashboard" : t("login")}
          </Link>
        )}
        <LanguageSwitcher />
        <span className="header-cta is-disabled" aria-label={t("ticketsLabel")}>
          {t("tickets")}
        </span>
      </div>
    </header>
  );
}
