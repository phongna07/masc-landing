import type { Order } from "./core";

type OrderExportRow = Pick<Order, "id" | "buyerEmail" | "snapshot" | "referralCode"> & {
	providerOrder: number;
	settled: number;
	payment: Order["paymentStatus"];
	fulfillment: Order["fulfillmentStatus"];
	created: Date;
};
const columns = ["order", "providerOrder", "buyerEmail", "package", "category", "quantity", "total", "settled", "payment", "fulfillment", "created", "promoCode", "referralCode", "bundleQuantity", "unitPrice"] as const;
type ExportCopy = {
	exportHeaders: Record<typeof columns[number], string>;
	categories: Record<Order["snapshot"]["category"], string>;
	payment: Record<Order["paymentStatus"], string>;
	fulfillment: Record<Order["fulfillmentStatus"], string>;
};

function csv(value: string | number) {
	let text = String(value);
	if (/^[=+@\-\t\r\n]/.test(text)) text = "'" + text;
	return `"${text.replaceAll('"', '""')}"`;
}

export function renderOrderCsv(rows: OrderExportRow[], copy: ExportCopy) {
	const header = columns.map(key => csv(copy.exportHeaders[key])).join(",");
	const body = rows.map(row => [row.id, row.providerOrder, row.buyerEmail, row.snapshot.packageName, copy.categories[row.snapshot.category], row.snapshot.quantity, row.snapshot.totalPrice, row.settled, copy.payment[row.payment], copy.fulfillment[row.fulfillment], row.created.toISOString(), row.snapshot.promo?.code ?? "", row.referralCode ?? "", row.snapshot.bundleQuantity ?? 1, row.snapshot.unitPrice ?? row.snapshot.totalPrice].map(csv).join(",")).join("\r\n");
	return `\ufeff${header}\r\n${body}`;
}
