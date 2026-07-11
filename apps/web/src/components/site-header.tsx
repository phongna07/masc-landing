"use client";

import { useTranslations } from "next-intl";

import LanguageSwitcher from "@/components/language-switcher";

type SiteHeaderProps = {
  landingPage?: boolean;
};

export default function SiteHeader({ landingPage = false }: SiteHeaderProps) {
  const t = useTranslations("Home.header");
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
        <LanguageSwitcher />
        <a className="header-login" href="/login">
          {t("login")}
        </a>
        <span className="header-cta is-disabled" aria-label={t("ticketsLabel")}>
          {t("tickets")}
        </span>
      </div>
    </header>
  );
}
