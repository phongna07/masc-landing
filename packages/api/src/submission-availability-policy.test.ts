import assert from "node:assert/strict";
import test from "node:test";

import { resolveSubmissionAvailability } from "./submission-availability-policy";

test("a closed Round 1 master setting denies every track", () => {
	for (const roundOneTrackOpen of [false, true]) {
		assert.deepEqual(resolveSubmissionAvailability({
			round: "1",
			roundOpen: false,
			roundOneTrackAssigned: true,
			roundOneTrackOpen,
		}), { isOpen: false, reason: "ROUND_SUBMISSION_CLOSED" });
	}
});

test("an open Round 1 master setting still denies a closed assigned track", () => {
	assert.deepEqual(resolveSubmissionAvailability({
		round: "1",
		roundOpen: true,
		roundOneTrackAssigned: true,
		roundOneTrackOpen: false,
	}), { isOpen: false, reason: "ROUND_ONE_TRACK_SUBMISSION_CLOSED" });
});

test("Round 1 opens when both the master setting and assigned track are open", () => {
	assert.deepEqual(resolveSubmissionAvailability({
		round: "1",
		roundOpen: true,
		roundOneTrackAssigned: true,
		roundOneTrackOpen: true,
	}), { isOpen: true, reason: null });
});

test("Round 1 denies a team without an assigned track", () => {
	assert.deepEqual(resolveSubmissionAvailability({
		round: "1",
		roundOpen: true,
		roundOneTrackAssigned: false,
		roundOneTrackOpen: true,
	}), { isOpen: false, reason: "ROUND_ONE_TRACK_NOT_ASSIGNED" });
});

test("other rounds depend only on their master setting", () => {
	for (const round of ["0.5", "2", "3", "4", "5"] as const) {
		assert.deepEqual(resolveSubmissionAvailability({ round, roundOpen: true }),
			{ isOpen: true, reason: null });
		assert.deepEqual(resolveSubmissionAvailability({ round, roundOpen: false }),
			{ isOpen: false, reason: "ROUND_SUBMISSION_CLOSED" });
	}
});
