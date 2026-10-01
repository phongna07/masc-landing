import assert from "node:assert/strict";
import test from "node:test";

import { MAX_PROBLEM_STATEMENT_FILE_SIZE } from "./round-one-problem-statements";
import { completeProblemStatementUpload, isAdmittedToProblemStatementRound, problemStatementFileSchema, shouldShowProblemStatementReminder } from "./round-problem-statements";
import type { RoundId } from "./rounds";

const file = { round: "2", filename: "statement.pdf", mimeType: "application/pdf", fileSize: 1 };
const membership = (round: RoundId, status: "pending" | "approved" | "rejected" = "approved") => ({
	registered: true, round, team: { status },
});

test("problem statements accept both later rounds and the inclusive 200 MiB boundary", () => {
	for (const round of ["2", "3"]) {
		for (const fileSize of [1, MAX_PROBLEM_STATEMENT_FILE_SIZE]) {
			assert.equal(problemStatementFileSchema.safeParse({ ...file, round, fileSize, filename: "STATEMENT.PDF" }).success, true);
		}
	}
});

test("uploads reject unsupported rounds, extensions, MIME types, and invalid sizes", () => {
	for (const invalid of [
		{ round: "0.5" }, { round: "1" }, { round: "4" },
		{ filename: "statement.txt" }, { filename: "statement.pdf.exe" }, { filename: "" },
		{ mimeType: "text/plain" }, { mimeType: "" },
		{ fileSize: 0 }, { fileSize: -1 }, { fileSize: 1.5 }, { fileSize: MAX_PROBLEM_STATEMENT_FILE_SIZE + 1 },
	]) {
		assert.equal(problemStatementFileSchema.safeParse({ ...file, ...invalid }).success, false);
	}
});

test("approved membership must match the requested round", () => {
	for (const round of ["2", "3"] as const) {
		assert.equal(isAdmittedToProblemStatementRound(round, membership(round)), true);
		for (const status of ["pending", "rejected"] as const) {
			assert.equal(isAdmittedToProblemStatementRound(round, membership(round, status)), false);
		}
		assert.equal(isAdmittedToProblemStatementRound(round, { registered: false, round }), false);
		assert.equal(isAdmittedToProblemStatementRound(round, membership(round === "2" ? "3" : "2")), false);
	}
	assert.equal(isAdmittedToProblemStatementRound("0.5", membership("0.5")), false);
});

test("Round 1 preview admission additionally requires an assigned track, independently of submission settings", () => {
	assert.equal(isAdmittedToProblemStatementRound("1", membership("1")), false);
	const assigned = { ...membership("1"), team: { status: "approved" as const, preferenceStatus: "assigned", assignedTrack: { isSubmissionOpen: false } } };
	assert.equal(isAdmittedToProblemStatementRound("1", assigned), true);
	assert.equal(isAdmittedToProblemStatementRound("1", { ...assigned, team: { ...assigned.team, preferenceStatus: "submitted" } }), false);
	assert.equal(isAdmittedToProblemStatementRound("1", { ...assigned, team: { ...assigned.team, assignedTrack: null } }), false);
	for (const status of ["pending", "rejected"] as const) {
		assert.equal(isAdmittedToProblemStatementRound("1", { ...assigned, team: { ...assigned.team, status } }), false);
	}
});

test("approved captains and teammates have the same statement access", () => {
	for (const round of ["2", "3"] as const) {
		for (const role of ["captain", "member"] as const) {
			const admitted = { ...membership(round), role };
			assert.equal(isAdmittedToProblemStatementRound(round, admitted), true);
		}
	}
});

test("later-round reminders require publication, open submissions, and approved membership", () => {
	for (const round of ["2", "3"] as const) {
		for (const isPublished of [false, true]) {
			for (const isSubmissionOpen of [false, true]) {
				for (const status of ["pending", "approved", "rejected"] as const) {
					assert.equal(shouldShowProblemStatementReminder({ round, membership: membership(round, status), isPublished, isSubmissionOpen }),
						isPublished && isSubmissionOpen && status === "approved");
				}
			}
		}
		assert.equal(shouldShowProblemStatementReminder({ round, membership: { registered: false, round }, isPublished: true, isSubmissionOpen: true }), false);
	}
});

test("Round 1 reminders require both master and assigned-track submission settings", () => {
	for (const isSubmissionOpen of [false, true]) {
		for (const trackOpen of [false, true]) {
			const team = { status: "approved" as const, preferenceStatus: "assigned", assignedTrack: { isSubmissionOpen: trackOpen } };
			const input = { round: "1" as const, membership: { ...membership("1"), team }, isPublished: true, isSubmissionOpen };
			assert.equal(shouldShowProblemStatementReminder(input), isSubmissionOpen && trackOpen);
			assert.equal(shouldShowProblemStatementReminder({ ...input, isPublished: false }), false);
			assert.equal(shouldShowProblemStatementReminder({ ...input, membership: membership("1") }), false);
		}
	}
});

const replacement = { objectKey: "new.pdf", previousObjectKey: "old.pdf", fileSize: 42 };

test("a replacement is verified and saved before deleting the old PDF", async () => {
	const events: string[] = [];
	await completeProblemStatementUpload(replacement, {
		head: async () => { events.push("head"); return { ContentLength: 42, ContentType: "application/pdf" }; },
		persist: async () => { events.push("persist"); },
		delete: async (key) => { events.push(`delete:${key}`); },
	});
	assert.deepEqual(events, ["head", "persist", "delete:old.pdf"]);
});

test("missing uploads never update metadata or remove the previous PDF", async () => {
	await assert.rejects(completeProblemStatementUpload(replacement, {
		head: async () => { throw new Error("Not found"); },
		persist: async () => { assert.fail("must not persist a missing upload"); },
		delete: async () => { assert.fail("must not remove the previous PDF"); },
	}), { message: "UPLOAD_NOT_FOUND", code: "BAD_REQUEST" });
});

test("R2 metadata mismatches remove only the invalid new upload", async () => {
	for (const object of [{ ContentLength: 41, ContentType: "application/pdf" }, { ContentLength: 42, ContentType: "text/plain" }, {}]) {
		const deleted: string[] = [];
		await assert.rejects(completeProblemStatementUpload(replacement, {
			head: async () => object,
			persist: async () => { assert.fail("must not persist an invalid upload"); },
			delete: async (key) => { deleted.push(key); },
		}), { message: "UPLOAD_MISMATCH", code: "BAD_REQUEST" });
		assert.deepEqual(deleted, ["new.pdf"]);
	}
});

test("database failure preserves the old statement and cleans up the replacement", async () => {
	const deleted: string[] = [];
	const failure = new Error("Database unavailable");
	await assert.rejects(completeProblemStatementUpload(replacement, {
		head: async () => ({ ContentLength: 42, ContentType: "application/pdf" }),
		persist: async () => { throw failure; },
		delete: async (key) => { deleted.push(key); },
	}), failure);
	assert.deepEqual(deleted, ["new.pdf"]);
});

test("cleanup failure does not undo a successful replacement or hide the original database error", async () => {
	const operations = {
		head: async () => ({ ContentLength: 42, ContentType: "application/pdf" }),
		persist: async () => {},
		delete: async () => { throw new Error("R2 unavailable"); },
	};
	await completeProblemStatementUpload(replacement, operations);
	await assert.rejects(completeProblemStatementUpload(replacement, { ...operations, persist: async () => { throw new Error("Database failure"); } }),
		{ message: "Database failure" });
});

test("retrying finalization cannot clean up the currently persisted object", async () => {
	await assert.rejects(completeProblemStatementUpload({ ...replacement, previousObjectKey: "new.pdf" }, {
		head: async () => ({ ContentLength: 42, ContentType: "application/pdf" }),
		persist: async () => { throw new Error("Database failure"); },
		delete: async () => { assert.fail("must not remove the current PDF"); },
	}), { message: "Database failure" });
});
