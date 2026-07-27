import { db } from "@masc-landing/db";
import { admissionSettings } from "@masc-landing/db/schema/index";
import { TRPCError } from "@trpc/server";

import { type RoundId, roundIds } from "./rounds";

export const directAdmissionRounds = ["0.5", "1"] as const;
export type DirectAdmissionRound = (typeof directAdmissionRounds)[number];

export const defaultAdmissionSettings = {
	"0.5": true,
	"1": false,
	"2": false,
	"3": false,
} satisfies Record<RoundId, boolean>;

export async function getAdmissionSettings() {
	const rows = await db.select({ round: admissionSettings.round, isOpen: admissionSettings.isOpen })
		.from(admissionSettings);
	const settings: Record<RoundId, boolean> = { ...defaultAdmissionSettings };
	for (const row of rows) {
		if (roundIds.includes(row.round as RoundId)) settings[row.round as RoundId] = row.isOpen;
	}
	return settings;
}

export async function requireAdmissionOpen(round: DirectAdmissionRound) {
	const settings = await getAdmissionSettings();
	if (!settings[round]) {
		throw new TRPCError({ code: "FORBIDDEN", message: "ROUND_ADMISSION_CLOSED" });
	}
}
