"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@masc-landing/ui/components/dropdown-menu";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import type { Locale } from "@/i18n/config";

export default function LanguageSwitcher() {
  const activeLocale = useLocale() as Locale;
  const pathname = usePathname();
  const t = useTranslations("LanguageSwitcher");
  const localeHref = (locale: Locale) =>
    `/api/locale?locale=${locale}&returnTo=${encodeURIComponent(pathname)}`;
  const activeLabel = activeLocale === "en" ? t("english") : t("vietnamese");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="language-trigger"
        aria-label={t("label")}
      >
        <span>{activeLabel}</span>
        <ChevronDownIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="language-menu">
        <DropdownMenuItem render={<a href={localeHref("en")} />}>
          {t("english")}
          {activeLocale === "en" && <CheckIcon className="language-check" aria-hidden="true" />}
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href={localeHref("vi")} />}>
          {t("vietnamese")}
          {activeLocale === "vi" && <CheckIcon className="language-check" aria-hidden="true" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
