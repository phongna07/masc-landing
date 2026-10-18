"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

// Reuse the application Toaster. Messages contain localized outcomes, never
// admission credentials, raw provider responses or free-text admin inputs.
export function useTicketNotifications() {
	const t = useTranslations("Tickets");
	const error = useCallback((failure: { message: string }) => {
		toast.error(t.has(`errors.${failure.message}`) ? t(`errors.${failure.message}`) : t("errors.operationFailed"), { id: "ticket-action-error" });
	}, [t]);
	return useMemo(() => ({ success: toast.success, info: toast.info, warning: toast.warning, dismiss: toast.dismiss, error }), [error]);
}
