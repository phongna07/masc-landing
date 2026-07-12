import { db } from "@masc-landing/db";
import { submissionSettings } from "@masc-landing/db/schema/index";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { type RoundId, roundIds } from "./rounds";

export const defaultSubmissionSettings = Object.fromEntries(
	roundIds.map((round) => [round, round === "0.5"]),
) as Record<RoundId, boolean>;

export async function getSubmissionSettings() {
	const rows = await db.select({ round: submissionSettings.round, isOpen: submissionSettings.isOpen })
		.from(submissionSettings);
	const settings = { ...defaultSubmissionSettings };
	for (const row of rows) {
		if (roundIds.includes(row.round as RoundId)) settings[row.round as RoundId] = row.isOpen;
	}
	return settings;
}

export async function requireSubmissionOpen(round: RoundId) {
	const settings = await getSubmissionSettings();
	if (!settings[round]) {
		throw new TRPCError({ code: "FORBIDDEN", message: "ROUND_SUBMISSION_CLOSED" });
	}
}
