"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { loginDestination } from "@/lib/login-destination";
import { BrandLogo } from "@/components/hero-brand-logo";
import { LoaderCircleIcon } from "lucide-react";

export default function GoogleCallbackClient({ next, success, popup }: { next: string; success: boolean; popup: boolean }) {
	const t = useTranslations("Auth");
	useEffect(() => {
		if (popup) {
			try {
				if (window.opener && !window.opener.closed) {
					window.opener.postMessage({ type: "google-auth-complete", success }, window.location.origin);
					window.close();
					return;
				}
			} catch {
				// Complete in this window if the opener is no longer accessible.
			}
		}
		window.location.replace(success ? loginDestination(next) : `/login?next=${encodeURIComponent(loginDestination(next))}`);
	}, [next, success, popup]);
	return <main className="dashboard-page auth-callback-page"><section className="auth-callback-card"><BrandLogo className="brand-logo" /><p className="dashboard-eyebrow">MASC · HYPERNOVA</p><p className="auth-callback-status" role="status"><LoaderCircleIcon aria-hidden="true" />{t("google.completing")}</p></section></main>;
}
