import { z } from "zod";

import {
	admissionMethods,
	eliminationFilters,
	preferenceStatuses,
	registrationStatuses,
	submissionFilters,
	type MailCampaignAudience,
	type PreferenceStatus,
} from "./mail-campaign-schema";
import { roundSchema } from "./rounds";

export const mailCampaignAudienceSchema = z.object({
	round: roundSchema,
	registrationStatuses: z.array(z.enum(registrationStatuses)).min(1).max(registrationStatuses.length),
	eliminationFilter: z.enum(eliminationFilters),
	submissionFilter: z.enum(submissionFilters),
	preferenceStatuses: z.array(z.enum(preferenceStatuses)).min(1).max(preferenceStatuses.length),
	assignedTrackIds: z.array(z.string().trim().min(1).max(128)).max(500)
		.refine((ids) => new Set(ids).size === ids.length, "DUPLICATE_ASSIGNED_TRACK_IDS"),
	admissionMethods: z.array(z.enum(admissionMethods)).min(1).max(admissionMethods.length),
}).superRefine((audience, context) => {
	if (audience.round === "1" && audience.preferenceStatuses.includes("assigned")
		&& audience.assignedTrackIds.length === 0) {
		context.addIssue({
			code: "custom",
			path: ["assignedTrackIds"],
			message: "ASSIGNED_TRACK_REQUIRED",
		});
	}
});

export function matchesRoundOnePreferenceSelection(
	team: { preferenceStatus: PreferenceStatus | null; assignedTrackId: string | null },
	audience: Pick<MailCampaignAudience, "preferenceStatuses" | "assignedTrackIds">,
) {
	if (!team.preferenceStatus || !audience.preferenceStatuses.includes(team.preferenceStatus)) return false;
	return team.preferenceStatus !== "assigned"
		|| (team.assignedTrackId !== null && audience.assignedTrackIds.includes(team.assignedTrackId));
}

export function unknownMailCampaignTrackIds(selectedIds: string[], knownIds: string[]) {
	const known = new Set(knownIds);
	return selectedIds.filter((id) => !known.has(id));
}
