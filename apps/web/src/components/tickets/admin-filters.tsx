"use client";

import { Input } from "@masc-landing/ui/components/input";
import { useTranslations } from "next-intl";

export type TicketFilters = { search: string; status: string; category: "" | "normal" | "vip"; validity: "" | "valid" | "revoked"; fulfillment: "" | "pending" | "issued" | "review"; emailStatus: "" | "pending" | "sending" | "sent" | "failed" };
export const emptyTicketFilters: TicketFilters = { search: "", status: "", category: "", validity: "", fulfillment: "", emailStatus: "" };
export default function AdminFilters({ value, onChange, gifted = false }: { value: TicketFilters; onChange: (value: TicketFilters) => void; gifted?: boolean }) {
	const t = useTranslations("Tickets");
	return <div className="ticket-grid ticket-filters"><label>{t("search")}<Input maxLength={100} value={value.search} onChange={e => onChange({ ...value, search: e.target.value })} placeholder={t(gifted ? "searchBatch" : "searchOrder")} /></label><label>{t("category")}<select value={value.category} onChange={e => onChange({ ...value, category: e.target.value as TicketFilters["category"] })}><option value="">{t("all")}</option>{["normal", "vip"].map(key => <option key={key} value={key}>{t(`categories.${key}`)}</option>)}</select></label>
		{!gifted && <><label>{t("paymentLabel")}<select value={value.status} onChange={e => onChange({ ...value, status: e.target.value })}><option value="">{t("all")}</option>{["creating", "pending", "processing", "paid", "cancelled", "expired", "failed", "review"].map(key => <option key={key} value={key}>{t(`payment.${key}`)}</option>)}</select></label><label>{t("fulfillmentLabel")}<select value={value.fulfillment} onChange={e => onChange({ ...value, fulfillment: e.target.value as TicketFilters["fulfillment"] })}><option value="">{t("all")}</option>{["pending", "issued", "review"].map(key => <option key={key} value={key}>{t(`fulfillment.${key}`)}</option>)}</select></label><label>{t("validityLabel")}<select value={value.validity} onChange={e => onChange({ ...value, validity: e.target.value as TicketFilters["validity"] })}><option value="">{t("all")}</option>{["valid", "revoked"].map(key => <option key={key} value={key}>{t(`validity.${key}`)}</option>)}</select></label><label>{t("emailDelivery")}<select value={value.emailStatus} onChange={e => onChange({ ...value, emailStatus: e.target.value as TicketFilters["emailStatus"] })}><option value="">{t("all")}</option>{["pending", "sending", "sent", "failed"].map(key => <option key={key} value={key}>{t(`emailStatus.${key}`)}</option>)}</select></label></>}
	</div>;
}
