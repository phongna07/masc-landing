import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { columnKeys, entranceRows, entranceSearchIndex, matchesEntranceSearch, entranceExcelData } from "./entrance-info-data.ts";

const messages = JSON.parse(readFileSync(new URL("../../../../messages/vi.json", import.meta.url), "utf8")).EntranceInfo;
const t = key => key.split(".").reduce((value, part) => value[part], messages);
const ticket = {
	id: "ticket-001", source: "sales-log", category: "normal", ordinal: 1, benefits: ["networkingLunch"], validity: "valid",
	createdAt: "2026-11-01T18:00:00Z", acceptedCount: 0,
	recipientName: "Đặng Thị Ánh", recipientEmail: null, recipientPhone: null,
	buyerName: "Buyer Other", buyerEmail: "buyer@example.com", buyerPhone: "+84 (090) 123-4567",
	orderId: null, orderCode: "00123456", packageName: null, orderQuantity: null, paymentStatus: null, fulfillmentStatus: null,
	orderPrice: null, paidAt: null, promoCode: null, referralCode: null, batchId: null, batchTitle: null, batchNote: null,
	salesLogId: "sale-001", salesQuantity: 2, amountReceived: 200000, issuerName: "Issuer", issuerEmail: "issuer@example.com",
};
const rows = entranceRows([ticket, { ...ticket, id: "ticket-002", recipientName: null, buyerName: null }], t, "vi");

test("contacts fall back field by field and retain distinct original contacts", () => {
	assert.equal(rows[0].values.contactName, "Đặng Thị Ánh");
	assert.equal(rows[0].values.contactEmail, "buyer@example.com");
	assert.equal(rows[0].values.recipientEmail, null);
	assert.equal(rows[0].values.buyerName, "Buyer Other");
	assert.equal(rows[1].values.contactName, null);
	assert.match(rows[0].values.createdAt, /02\/11\/2026/);
	assert.match(rows[0].values.createdAt, /01:00:00/);
});

test("search supports accents, literal punctuation, all terms, formatted phones and every column", () => {
	const index = entranceSearchIndex(rows[0]);
	for (const search of ["DANG thi anh", "BUYER@EXAMPLE.COM", "0901234567", "+84(090)123-4567", "dang issuer", "cong tac vien", "networking lunch"]) {
		assert.equal(matchesEntranceSearch(index, search), true, search);
	}
	for (const search of ["dang missing", "%", "\\", "[", "nothing"]) assert.equal(matchesEntranceSearch(index, search), false, search);
	for (const key of columnKeys) {
		const value = rows[0].values[key];
		if (value != null && value !== "") assert.equal(matchesEntranceSearch(index, String(value)), true, key);
	}
});

test("Excel uses all rows despite an active search and writes identifiers/phones as text", () => {
	const filtered = rows.filter(row => matchesEntranceSearch(entranceSearchIndex(row), "dang"));
	assert.equal(filtered.length, 1);
	const data = entranceExcelData(rows, t);
	assert.equal(data.length, 3);
	assert.equal(data[0].length, columnKeys.length);
	assert.equal(data[0][0].value, "ID vé");
	for (const key of ["id", "orderCode", "buyerPhone"]) {
		const cell = data[1][columnKeys.indexOf(key)];
		assert.equal(cell.type, String);
		assert.equal(cell.value, rows[0].values[key]);
	}
	assert.equal(data[1][columnKeys.indexOf("amountReceived")].type, Number);
});


test("both locales provide the admin tab and every page/export label", () => {
	for (const locale of ["en", "vi"]) {
		const all = JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), "utf8"));
		assert.equal(all.Admin.tabs.entranceInfo, all.EntranceInfo.title);
		for (const key of columnKeys) assert.equal(typeof all.EntranceInfo.columns[key], "string", `${locale}: ${key}`);
	}
});
