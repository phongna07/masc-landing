"use client";

import { canAccessAdminArea, type AdminArea, type AdminRole } from "@masc-landing/api/admin-roles";
import { rounds } from "@masc-landing/api/rounds";
import { FileTextIcon, LayoutDashboardIcon, MailIcon, MegaphoneIcon, MenuIcon, UsersIcon, XIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "@/components/hero-brand-logo";
import LanguageSwitcher from "@/components/language-switcher";
import UserMenu from "@/components/user-menu";

const items = [
  { href: "/admin", key: "overview", area: "overview", icon: LayoutDashboardIcon },
  { href: "/admin/announcements", key: "announcements", area: "announcements", icon: MegaphoneIcon },
  { href: "/admin/users", key: "users", area: "users", icon: UsersIcon },
  { href: "/admin/teams", key: "teams", area: "teams", icon: UsersIcon },
  { href: "/admin/mail", key: "mail", area: "mail", icon: MailIcon },
  ...rounds.map((round) => ({ href: `/admin/${round.slug}`, round: round.id, area: "rounds", icon: FileTextIcon })),
] as const;

export default function AdminShell({ children, role }: { children: React.ReactNode; role: AdminRole }) {
  const t = useTranslations("Admin");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visibleItems = items.filter((item) => canAccessAdminArea(role, item.area as AdminArea));

  return (
    <div className="admin-page">
      <header className="dashboard-navbar admin-navbar">
        <Link className="brand" href="/" aria-label={t("nav.homeLabel")}>
          <BrandLogo className="brand-logo" />
          <span className="brand-copy">Marketing All-Star Challenge 2026<br /><small>HYPERNOVA</small></span>
        </Link>
        <div className="dashboard-nav-actions">
          <LanguageSwitcher />
          <UserMenu />
          <button
            className="admin-menu-button"
            type="button"
            aria-label={t(open ? "nav.close" : "nav.open")}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <XIcon aria-hidden="true" /> : <MenuIcon aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className={`admin-sidebar${open ? " is-open" : ""}`} aria-label={t("nav.label")}>
          <div className="admin-sidebar-heading">
            <p>{t("eyebrow")}</p>
            <strong>{t("title")}</strong>
            <span className="admin-role-badge">{t(`roles.${role}`)}</span>
          </div>
          <nav>
            {visibleItems.map((item) => {
              const { href, icon: Icon } = item;
              const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href as Route}
                  className={active ? "is-active" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Icon aria-hidden="true" /> {"round" in item ? t("tabs.round", { round: item.round }) : t(`tabs.${item.key}`)}
                </Link>
              );
            })}
          </nav>
        </aside>
        {open && <button className="admin-sidebar-backdrop" type="button" aria-label={t("nav.close")} onClick={() => setOpen(false)} />}
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
