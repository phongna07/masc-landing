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
	"member1_university",
	"member2_name",
	"member2_email",
	"member2_university",
	"member3_name",
	"member3_email",
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

export type MailCampaignTemplateValues = Record<MailCampaignPlaceholder, string>;
