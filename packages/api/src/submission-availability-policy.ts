import type { RoundId } from "./rounds";

export type SubmissionClosedReason =
	| "ROUND_SUBMISSION_CLOSED"
	| "ROUND_ONE_TRACK_NOT_ASSIGNED"
	| "ROUND_ONE_TRACK_SUBMISSION_CLOSED";

export type SubmissionAvailability =
	| { isOpen: true; reason: null }
	| { isOpen: false; reason: SubmissionClosedReason };

export function resolveSubmissionAvailability(input: {
	round: RoundId;
	roundOpen: boolean;
	roundOneTrackAssigned?: boolean;
	roundOneTrackOpen?: boolean;
}): SubmissionAvailability {
	if (!input.roundOpen) {
		return { isOpen: false, reason: "ROUND_SUBMISSION_CLOSED" };
	}
	if (input.round !== "1") return { isOpen: true, reason: null };
	if (!input.roundOneTrackAssigned) {
		return { isOpen: false, reason: "ROUND_ONE_TRACK_NOT_ASSIGNED" };
	}
	if (!input.roundOneTrackOpen) {
		return { isOpen: false, reason: "ROUND_ONE_TRACK_SUBMISSION_CLOSED" };
	}
	return { isOpen: true, reason: null };
}
