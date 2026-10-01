import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { MAX_PROBLEM_STATEMENT_FILE_SIZE } from "./round-one-problem-statements";
import type { RoundId } from "./rounds";
import { resolveSubmissionAvailability } from "./submission-availability-policy";

export const problemStatementRoundSchema = z.enum(["2", "3"]);
export type ProblemStatementRound = z.infer<typeof problemStatementRoundSchema>;
export const problemStatementFileSchema = z.object({
	round: problemStatementRoundSchema,
	filename: z.string().trim().min(1).max(255).refine((name) => name.toLowerCase().endsWith(".pdf"), "UNSUPPORTED_FILE"),
	mimeType: z.literal("application/pdf"),
	fileSize: z.number().int().positive().max(MAX_PROBLEM_STATEMENT_FILE_SIZE),
});

type ProblemStatementMembership = {
	registered: boolean;
	round: RoundId;
	team?: { status: "pending" | "approved" | "rejected"; preferenceStatus?: string; assignedTrack?: { isSubmissionOpen: boolean } | null };
};

export function isAdmittedToProblemStatementRound(round: RoundId, membership: ProblemStatementMembership) {
	return round !== "0.5" && membership.round === round && membership.registered
		&& membership.team?.status === "approved"
		&& (round !== "1" || (membership.team.preferenceStatus === "assigned" && membership.team.assignedTrack != null));
}

export function shouldShowProblemStatementReminder(input: {
	round: RoundId;
	membership: ProblemStatementMembership;
	isPublished: boolean;
	isSubmissionOpen: boolean;
}) {
	return input.isPublished && isAdmittedToProblemStatementRound(input.round, input.membership)
		&& resolveSubmissionAvailability({
			round: input.round,
			roundOpen: input.isSubmissionOpen,
			roundOneTrackAssigned: input.membership.team?.preferenceStatus === "assigned" && input.membership.team.assignedTrack != null,
			roundOneTrackOpen: input.membership.team?.assignedTrack?.isSubmissionOpen,
		}).isOpen;
}

// Keep the previous PDF available until the verified replacement is persisted.
export async function completeProblemStatementUpload(input: {
	objectKey: string;
	previousObjectKey: string | null;
	fileSize: number;
}, operations: {
	head: () => Promise<{ ContentLength?: number; ContentType?: string }>;
	persist: () => Promise<unknown>;
	delete: (key: string) => Promise<unknown>;
}) {
	const bestEffortDelete = async (key: string) => {
		try { await operations.delete(key); } catch { /* Persisted metadata survives R2 cleanup failures. */ }
	};
	let object;
	try {
		object = await operations.head();
	} catch {
		throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_NOT_FOUND" });
	}
	if (object.ContentLength !== input.fileSize || object.ContentType !== "application/pdf") {
		if (input.previousObjectKey !== input.objectKey) await bestEffortDelete(input.objectKey);
		throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_MISMATCH" });
	}
	try {
		await operations.persist();
	} catch (error) {
		if (input.previousObjectKey !== input.objectKey) await bestEffortDelete(input.objectKey);
		throw error;
	}
	if (input.previousObjectKey && input.previousObjectKey !== input.objectKey) {
		await bestEffortDelete(input.previousObjectKey);
	}
}
