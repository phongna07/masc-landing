import assert from "node:assert/strict";
import test from "node:test";

import { homeCountdownInputSchema } from "./home-countdown-input";

const valid = {
	openAt: "2026-10-03T00:00:00+07:00",
	closeAt: "2026-10-11T00:00:00+07:00",
	en: { applications: "Round 2", closesIn: "Closes in", opensIn: "Opens in", closed: "Closed" },
	vi: { applications: "Vòng 2", closesIn: "Sắp đóng", opensIn: "Sắp mở", closed: "Đã đóng" },
};

test("accepts ordered dates and complete bilingual copy", () => {
	assert.equal(homeCountdownInputSchema.safeParse(valid).success, true);
});

test("rejects equal, reversed, and malformed dates", () => {
	assert.equal(homeCountdownInputSchema.safeParse({ ...valid, closeAt: valid.openAt }).success, false);
	assert.equal(homeCountdownInputSchema.safeParse({ ...valid, closeAt: "2026-10-02T00:00:00+07:00" }).success, false);
	assert.equal(homeCountdownInputSchema.safeParse({ ...valid, openAt: "2026-10-03T00:00:00" }).success, false);
});

test("requires nonblank text in both languages", () => {
	assert.equal(homeCountdownInputSchema.safeParse({ ...valid, en: { ...valid.en, closed: "  " } }).success, false);
	assert.equal(homeCountdownInputSchema.safeParse({ ...valid, vi: { ...valid.vi, opensIn: "" } }).success, false);
});
