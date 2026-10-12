"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useTicketNotifications } from "./use-ticket-notifications";

export function useTicketDownload() {
	const t = useTranslations("Tickets");
	const notify = useTicketNotifications();
	const [isDownloading, setIsDownloading] = useState(false);
	const active = useRef(false);

	async function download(url: string, filename: string, mimeType: string, failureMessage: string) {
		if (active.current) return;
		active.current = true;
		setIsDownloading(true);
		try {
			const response = await fetch(url, { credentials: "include", cache: "no-store" });
			if (!response.ok || response.headers.get("content-type")?.split(";")[0]?.trim() !== mimeType) throw new Error("Download unavailable");
			const file = await response.blob();
			if (!file.size) throw new Error("Empty download");
			const objectUrl = URL.createObjectURL(file);
			try {
				const link = document.createElement("a");
				link.href = objectUrl;
				link.download = filename;
				link.hidden = true;
				document.body.append(link);
				try { link.click(); } finally { link.remove(); }
			} finally {
				window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
			}
			// The browser controls the final save; successful retrieval starts it.
			notify.info(t("notifications.downloadStarted"));
		} catch {
			notify.error({ message: failureMessage });
		} finally {
			active.current = false;
			setIsDownloading(false);
		}
	}

	return { download, isDownloading };
}
