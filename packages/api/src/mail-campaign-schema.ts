import type { RoundId } from "./rounds";

export const registrationStatuses = ["pending", "approved", "rejected"] as const;
export const eliminationFilters = ["any", "active", "eliminated"] as const;
export const submissionFilters = ["any", "submitted", "not_submitted"] as const;
export const preferenceStatuses = ["not_submitted", "submitted", "assigned"] as const;
export const admissionMethods = ["cv_screening", "round_0_5_promotion"] as const;

export const mailCampaignPlaceholders = [
	"team_name",
	"round",
	"captain_name",
	"captain_email",
	"captain_phone",
	"member1_name",
	"member1_email",
	"member1_phone",
	"member1_facebook_profile_url",
	"member1_university",
	"member2_name",
	"member2_email",
	"member2_phone",
	"member2_facebook_profile_url",
	"member2_university",
	"member3_name",
	"member3_email",
	"member3_phone",
	"member3_facebook_profile_url",
	"member3_university",
	"assigned_track",
	"preference1",
	"preference2",
	"preference3",
] as const;

export type RegistrationStatus = (typeof registrationStatuses)[number];
export type EliminationFilter = (typeof eliminationFilters)[number];
export type SubmissionFilter = (typeof submissionFilters)[number];
export type PreferenceStatus = (typeof preferenceStatuses)[number];
export type AdmissionMethod = (typeof admissionMethods)[number];
export type MailCampaignPlaceholder = (typeof mailCampaignPlaceholders)[number];

const mailCampaignPlaceholderSet = new Set<string>(mailCampaignPlaceholders);
const mailCampaignPlaceholderPattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export function inspectMailCampaignTemplate(template: string) {
	const unknownPlaceholders = new Set<string>();
	const placeholdersInTags = new Set<string>();
	for (const match of template.matchAll(mailCampaignPlaceholderPattern)) {
		if (!mailCampaignPlaceholderSet.has(match[1]!)) unknownPlaceholders.add(match[1]!);
	}
	for (const tag of template.matchAll(/<[^>]*>/g)) {
		for (const match of tag[0].matchAll(mailCampaignPlaceholderPattern)) {
			placeholdersInTags.add(match[1]!);
		}
	}
	const withoutPlaceholders = template.replace(mailCampaignPlaceholderPattern, "");
	return {
		unknownPlaceholders: [...unknownPlaceholders],
		placeholdersInTags: [...placeholdersInTags],
		malformed: withoutPlaceholders.includes("{{") || withoutPlaceholders.includes("}}"),
	};
}

export type MailCampaignAudience = {
	round: RoundId;
	registrationStatuses: RegistrationStatus[];
	eliminationFilter: EliminationFilter;
	submissionFilter: SubmissionFilter;
	preferenceStatuses: PreferenceStatus[];
	admissionMethods: AdmissionMethod[];
};

export type MailCampaignInput = MailCampaignAudience & {
	name: string;
	subjectTemplate: string;
	bodyTemplate: string;
};

export type MailCampaignTemplateValues = Record<MailCampaignPlaceholder, string | null>;
