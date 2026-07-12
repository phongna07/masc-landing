import { db } from "@masc-landing/db";
import { submissionSettings } from "@masc-landing/db/schema/index";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export const submissionSettingsId = "global";

export type SubmissionRound = "roundOne" | "roundTwo" | "roundThree";

export const defaultSubmissionSettings = {
	roundOneSubmissionOpen: true,
	roundTwoSubmissionOpen: false,
	roundThreeSubmissionOpen: false,
} as const;

export async function getSubmissionSettings() {
	const [settings] = await db
		.select({
			roundOneSubmissionOpen: submissionSettings.roundOneSubmissionOpen,
			roundTwoSubmissionOpen: submissionSettings.roundTwoSubmissionOpen,
			roundThreeSubmissionOpen: submissionSettings.roundThreeSubmissionOpen,
			updatedAt: submissionSettings.updatedAt,
		})
		.from(submissionSettings)
		.where(eq(submissionSettings.id, submissionSettingsId))
		.limit(1);

	return settings ?? { ...defaultSubmissionSettings, updatedAt: null };
}

export async function requireSubmissionOpen(round: SubmissionRound) {
	const settings = await getSubmissionSettings();
	const field = `${round}SubmissionOpen` as const;
	if (!settings[field]) {
		throw new TRPCError({ code: "FORBIDDEN", message: "ROUND_SUBMISSION_CLOSED" });
	}
}
