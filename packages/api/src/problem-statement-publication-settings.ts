import { db } from "@masc-landing/db";
import { problemStatementPublicationSettings } from "@masc-landing/db/schema/index";

import { type RoundId, roundIds } from "./rounds";

export const defaultProblemStatementPublicationSettings = Object.fromEntries(
	roundIds.map((round) => [round, false]),
) as Record<RoundId, boolean>;

export async function getProblemStatementPublicationSettings() {
	const rows = await db.select({
		round: problemStatementPublicationSettings.round,
		isPublished: problemStatementPublicationSettings.isPublished,
	}).from(problemStatementPublicationSettings);
	const settings = { ...defaultProblemStatementPublicationSettings };
	for (const row of rows) {
		if (roundIds.includes(row.round as RoundId)) settings[row.round as RoundId] = row.isPublished;
	}
	return settings;
}
