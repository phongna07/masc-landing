import assert from "node:assert/strict";
import test from "node:test";

import {
	MEBIBYTE,
	requireFileWithinUploadLimit,
} from "./upload-limit-validation";

const limit = 10 * MEBIBYTE;

test("accepts ordinary files below the configured upload limit", () => {
	assert.doesNotThrow(() => requireFileWithinUploadLimit(108 * 1024, limit));
});

test("accepts a file exactly at the configured upload limit", () => {
	assert.doesNotThrow(() => requireFileWithinUploadLimit(limit, limit));
});

test("rejects a file one byte above the configured upload limit", () => {
	assert.throws(
		() => requireFileWithinUploadLimit(limit + 1, limit),
		(error: unknown) => error instanceof Error && error.message === "FILE_TOO_LARGE",
	);
});

test("reports an empty file separately from an oversized file", () => {
	assert.throws(
		() => requireFileWithinUploadLimit(0, limit),
		(error: unknown) => error instanceof Error && error.message === "FILE_EMPTY",
	);
});
