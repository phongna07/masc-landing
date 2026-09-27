import { db } from "@masc-landing/db";
import { homeCountdownSettings } from "@masc-landing/db/schema/index";
import { eq } from "drizzle-orm";

import type { HomeCountdownInput } from "./home-countdown-input";

export { homeCountdownInputSchema } from "./home-countdown-input";
export type { HomeCountdownInput } from "./home-countdown-input";

export const HOME_COUNTDOWN_CACHE_TAG = "home-countdown-settings";

export async function getHomeCountdownSettings(): Promise<HomeCountdownInput> {
	const [row] = await db.select().from(homeCountdownSettings)
		.where(eq(homeCountdownSettings.id, "home")).limit(1);
	if (!row) throw new Error("Home countdown settings are missing; apply the database migration first.");

	return {
		openAt: row.openAt.toISOString(),
		closeAt: row.closeAt.toISOString(),
		en: {
			applications: row.applicationsEn,
			closesIn: row.closesInEn,
			opensIn: row.opensInEn,
			closed: row.closedEn,
		},
		vi: {
			applications: row.applicationsVi,
			closesIn: row.closesInVi,
			opensIn: row.opensInVi,
			closed: row.closedVi,
		},
	};
}

export async function saveHomeCountdownSettings(input: HomeCountdownInput) {
	const [updated] = await db.update(homeCountdownSettings).set({
		openAt: new Date(input.openAt),
		closeAt: new Date(input.closeAt),
		applicationsEn: input.en.applications,
		closesInEn: input.en.closesIn,
		opensInEn: input.en.opensIn,
		closedEn: input.en.closed,
		applicationsVi: input.vi.applications,
		closesInVi: input.vi.closesIn,
		opensInVi: input.vi.opensIn,
		closedVi: input.vi.closed,
		updatedAt: new Date(),
	}).where(eq(homeCountdownSettings.id, "home")).returning({ id: homeCountdownSettings.id });
	if (!updated) throw new Error("Home countdown settings are missing; apply the database migration first.");
	return getHomeCountdownSettings();
}
