import { db } from "@masc-landing/db";
import { roundEndSettings } from "@masc-landing/db/schema/index";

import { type RoundId, roundIds } from "./rounds";

export const defaultRoundEndSettings = Object.fromEntries(
	roundIds.map((round) => [round, false]),
) as Record<RoundId, boolean>;

export async function getRoundEndSettings() {
	const rows = await db.select({ round: roundEndSettings.round, isEnded: roundEndSettings.isEnded })
		.from(roundEndSettings);
	const settings = { ...defaultRoundEndSettings };
	for (const row of rows) {
		if (roundIds.includes(row.round as RoundId)) settings[row.round as RoundId] = row.isEnded;
	}
	return settings;
}
