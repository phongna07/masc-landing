import { db } from "@masc-landing/db";
import { dashboardTabSettings } from "@masc-landing/db/schema/index";

import { type RoundId, roundIds } from "./rounds";

export const defaultDashboardTabSettings = Object.fromEntries(
	roundIds.map((round) => [round, true]),
) as Record<RoundId, boolean>;

export async function getDashboardTabSettings() {
	const rows = await db.select({ round: dashboardTabSettings.round, isVisible: dashboardTabSettings.isVisible })
		.from(dashboardTabSettings);
	const settings = { ...defaultDashboardTabSettings };
	for (const row of rows) {
		if (roundIds.includes(row.round as RoundId)) settings[row.round as RoundId] = row.isVisible;
	}
	return settings;
}
