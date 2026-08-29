import { db } from "@masc-landing/db";
import { preferencesSettings } from "@masc-landing/db/schema/index";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";

export const ROUND_ONE_PREFERENCE_COUNT = 3;

export async function getRoundOnePreferenceSettings(activeOnly = true) {
	return db
		.select({
			id: preferencesSettings.id,
			name: preferencesSettings.name,
			displayOrder: preferencesSettings.displayOrder,
			isActive: preferencesSettings.isActive,
		})
		.from(preferencesSettings)
		.where(activeOnly ? eq(preferencesSettings.isActive, true) : undefined)
		.orderBy(asc(preferencesSettings.displayOrder), asc(preferencesSettings.createdAt));
}

export async function getAdminRoundOnePreferenceSettings() {
	const settings = await db
		.select({
			id: preferencesSettings.id,
			name: preferencesSettings.name,
			description: preferencesSettings.description,
			displayOrder: preferencesSettings.displayOrder,
			isActive: preferencesSettings.isActive,
			problemStatementOriginalFilename: preferencesSettings.problemStatementOriginalFilename,
			problemStatementFileSize: preferencesSettings.problemStatementFileSize,
		})
		.from(preferencesSettings)
		.orderBy(asc(preferencesSettings.displayOrder), asc(preferencesSettings.createdAt));

	return settings.map(({ problemStatementOriginalFilename, problemStatementFileSize, ...setting }) => ({
		...setting,
		problemStatement: problemStatementOriginalFilename !== null && problemStatementFileSize !== null
			? { originalFilename: problemStatementOriginalFilename, fileSize: problemStatementFileSize }
			: null,
	}));
}

export async function requireActiveRoundOnePreferences(preferenceIds: string[]) {
	if (
		preferenceIds.length !== ROUND_ONE_PREFERENCE_COUNT ||
		new Set(preferenceIds).size !== ROUND_ONE_PREFERENCE_COUNT
	) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_ROUND_ONE_PREFERENCES" });
	}

	const activeSettings = await db
		.select({ id: preferencesSettings.id })
		.from(preferencesSettings)
		.where(and(inArray(preferencesSettings.id, preferenceIds), eq(preferencesSettings.isActive, true)));
	if (activeSettings.length !== ROUND_ONE_PREFERENCE_COUNT) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "INACTIVE_ROUND_ONE_PREFERENCE" });
	}
}

export async function resolveRoundOnePreferences(preferenceIds: string[]) {
	if (!preferenceIds.length) return [];
	const settings = await db
		.select({ id: preferencesSettings.id, name: preferencesSettings.name })
		.from(preferencesSettings)
		.where(inArray(preferencesSettings.id, preferenceIds));
	const byId = new Map(settings.map((setting) => [setting.id, setting]));
	return preferenceIds.flatMap((id) => {
		const setting = byId.get(id);
		return setting ? [setting] : [];
	});
}
