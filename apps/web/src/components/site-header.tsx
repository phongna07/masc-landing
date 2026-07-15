"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { authClient } from "@/lib/auth-client";
import { BrandLogo } from "@/components/hero-brand-logo";
import LanguageSwitcher from "@/components/language-switcher";
import UserMenu from "@/components/user-menu";

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
        <BrandLogo className="brand-logo" />
        <span className="brand-copy">
          Marketing All-Star Challenge
          <br />
          <small>HYPERNOVA</small>
        </span>
      </a>
      <nav aria-label={t("navigationLabel")}>
        <a href={sectionHref("#about")}>{t("lookingBack")}</a>
        <a href={sectionHref("#journey")}>{t("videoChallenges")}</a>
        <a href={sectionHref("#news")}>{t("news")}</a>
      </nav>
      <div className="header-actions">
        {!isPending && (session?.user ? <UserMenu /> : <Link className="header-login" href="/login">{t("login")}</Link>)}
        <LanguageSwitcher />
      </div>
    </header>
  );
}
