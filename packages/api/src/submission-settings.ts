import { db } from "@masc-landing/db";
import { preferencesSettings, roundOneTeams, submissionSettings } from "@masc-landing/db/schema/index";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import { type RoundId, roundIds } from "./rounds";
import { resolveSubmissionAvailability } from "./submission-availability-policy";

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

export async function getSubmissionAvailability(round: RoundId, teamId: string) {
	const settings = await getSubmissionSettings();
	if (!settings[round] || round !== "1") {
		return resolveSubmissionAvailability({ round, roundOpen: settings[round] });
	}

	const [team] = await db.select({
		preferenceStatus: roundOneTeams.preferenceStatus,
		assignedTrackId: roundOneTeams.assignedTrackId,
		trackSubmissionOpen: preferencesSettings.isSubmissionOpen,
	}).from(roundOneTeams)
		.leftJoin(preferencesSettings, eq(roundOneTeams.assignedTrackId, preferencesSettings.id))
		.where(eq(roundOneTeams.id, teamId)).limit(1);

	return resolveSubmissionAvailability({
		round,
		roundOpen: true,
		roundOneTrackAssigned: team?.preferenceStatus === "assigned" && team.assignedTrackId !== null,
		roundOneTrackOpen: team?.trackSubmissionOpen ?? false,
	});
}

export async function requireSubmissionOpen(round: RoundId, teamId: string) {
	const availability = await getSubmissionAvailability(round, teamId);
	if (!availability.isOpen) {
		throw new TRPCError({ code: "FORBIDDEN", message: availability.reason });
	}
	return availability;
}
