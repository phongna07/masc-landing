import type { AppRouter } from "@masc-landing/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";
import type { Cell, SheetData } from "write-excel-file/browser";

export type EntranceTicket = inferRouterOutputs<AppRouter>["tickets"]["entranceInfo"][number];
export type Translate = (key: string) => string;

export const columnGroups = {
	ticket: ["id", "source", "category", "ordinal", "benefits", "validity", "createdAt", "acceptedCount"],
	contact: ["contactName", "contactEmail", "contactPhone"],
	recipient: ["recipientName", "recipientEmail", "recipientPhone"],
	buyer: ["buyerName", "buyerEmail", "buyerPhone"],
	order: ["orderId", "orderCode", "packageName", "orderQuantity", "paymentStatus", "fulfillmentStatus", "orderPrice", "paidAt", "promoCode", "referralCode"],
	gift: ["batchId", "batchTitle", "batchNote"],
	sales: ["salesLogId", "salesQuantity", "amountReceived", "issuerName", "issuerEmail"],
} as const;
export const columnKeys = Object.values(columnGroups).flat();
export type ColumnKey = typeof columnKeys[number];
export type EntranceRow = { id: string; values: Record<ColumnKey, string | number | null> };

export function formatEntranceDate(value: string | Date | null, locale: string) {
	if (!value) return null;
	return new Intl.DateTimeFormat(locale, {
		timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
		hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
	}).format(new Date(value)) + " (UTC+07:00)";
}

export function entranceRows(tickets: EntranceTicket[], t: Translate, locale: string): EntranceRow[] {
	return tickets.map(ticket => ({ id: ticket.id, values: {
		...ticket,
		contactName: ticket.recipientName || ticket.buyerName,
		contactEmail: ticket.recipientEmail || ticket.buyerEmail,
		contactPhone: ticket.recipientPhone || ticket.buyerPhone,
		source: t(`sources.${ticket.source}`), category: t(`categories.${ticket.category}`),
		validity: t(`validities.${ticket.validity}`),
		benefits: ticket.benefits.map(benefit => t(`benefits.${benefit}`)).join(", "),
		paymentStatus: ticket.paymentStatus ? t(`payments.${ticket.paymentStatus}`) : null,
		fulfillmentStatus: ticket.fulfillmentStatus ? t(`fulfillments.${ticket.fulfillmentStatus}`) : null,
		createdAt: formatEntranceDate(ticket.createdAt, locale), paidAt: formatEntranceDate(ticket.paidAt, locale),
	} }));
}

export function normalizeEntranceSearch(value: string) {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
}

export function entranceSearchIndex(row: EntranceRow) {
	const text = normalizeEntranceSearch(columnKeys.map(key => row.values[key] ?? "").join(" "));
	const phones = [row.values.contactPhone, row.values.recipientPhone, row.values.buyerPhone]
		.map(value => String(value ?? "").replace(/\D/g, ""));
	return { text, phones };
}

export function matchesEntranceSearch(index: ReturnType<typeof entranceSearchIndex>, search: string) {
	return normalizeEntranceSearch(search).trim().split(/\s+/).filter(Boolean).every(term => {
		if (index.text.includes(term)) return true;
		const digits = term.replace(/\D/g, "");
		return Boolean(digits && /^[+\d().-]+$/.test(term) && index.phones.some(phone => phone.includes(digits)));
	});
}

// The caller supplies the complete loaded rows, independently of the search results.
export function entranceExcelData(rows: EntranceRow[], t: Translate): SheetData {
	return [
		columnKeys.map(key => ({ value: t(`columns.${key}`), type: String, fontWeight: "bold", backgroundColor: "#6550ED", textColor: "#FFFFFF", wrap: true })),
		...rows.map(row => columnKeys.map((key): Cell => {
			const value = row.values[key];
			if (value == null || value === "") return null;
			return typeof value === "number" ? { value, type: Number } : { value, type: String };
		})),
	];
}

export async function exportEntranceExcel(rows: EntranceRow[], t: Translate) {
	const { default: writeExcelFile } = await import("write-excel-file/browser");
	const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
	await writeExcelFile(entranceExcelData(rows, t), {
		sheet: t("title"), columns: columnKeys.map(key => ({ width: key.toLowerCase().includes("id") ? 38 : 28 })),
		stickyRowsCount: 1, stickyColumnsCount: 1, orientation: "landscape",
	}).toFile(`masc-entrance-info-${stamp}.xlsx`);
}
