"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { loginDestination } from "@/lib/login-destination";
import { BrandLogo } from "@/components/hero-brand-logo";
import { LoaderCircleIcon } from "lucide-react";

export default function GoogleCallbackClient({ next, success }: { next: string; success: boolean }) {
	const t = useTranslations("Auth");
	useEffect(() => {
		if (window.opener) {
			window.opener.postMessage({ type: "google-auth-complete", success }, window.location.origin);
			window.close();
		} else {
			window.location.replace(success ? loginDestination(next) : `/login?next=${encodeURIComponent(loginDestination(next))}`);
		}
	}, [next, success]);
	return <main className="dashboard-page auth-callback-page"><section className="auth-callback-card"><BrandLogo className="brand-logo" /><p className="dashboard-eyebrow">MASC · HYPERNOVA</p><p className="auth-callback-status" role="status"><LoaderCircleIcon aria-hidden="true" />{t("google.completing")}</p></section></main>;
}
