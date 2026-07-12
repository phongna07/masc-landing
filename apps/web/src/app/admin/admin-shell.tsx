"use client";

import { FileTextIcon, MegaphoneIcon, MenuIcon, UsersIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useState } from "react";

import brandLogo from "@/assets/brand.svg";
import LanguageSwitcher from "@/components/language-switcher";
import UserMenu from "@/components/user-menu";

const items = [
  { href: "/admin/announcements", key: "announcements", icon: MegaphoneIcon },
  { href: "/admin/users", key: "users", icon: UsersIcon },
  { href: "/admin/teams", key: "teams", icon: UsersIcon },
  { href: "/admin/round-one", key: "roundOne", icon: FileTextIcon },
  { href: "/admin/round-two", key: "roundTwo", icon: FileTextIcon },
  { href: "/admin/round-three", key: "roundThree", icon: FileTextIcon },
] as const;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Admin");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="admin-page">
      <header className="dashboard-navbar admin-navbar">
        <Link className="brand" href="/" aria-label={t("nav.homeLabel")}>
          <img className="brand-logo" src={brandLogo.src} alt="" />
          <span className="brand-copy">MASC<br /><small>SUPERNOVA &apos;26</small></span>
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
          </div>
          <nav>
            {items.map(({ href, key, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={active ? "is-active" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Icon aria-hidden="true" /> {t(`tabs.${key}`)}
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
