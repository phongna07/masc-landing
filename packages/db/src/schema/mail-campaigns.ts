import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";
import {
	competitionRound,
	registrationStatus,
	roundOneAdmissionMethod,
	roundOnePreferenceStatus,
} from "./registration";

export const mailCampaignEliminationFilter = pgEnum("mail_campaign_elimination_filter", [
	"any",
	"active",
	"eliminated",
]);

export const mailCampaignSubmissionFilter = pgEnum("mail_campaign_submission_filter", [
	"any",
	"submitted",
	"not_submitted",
]);

export const mailCampaignDeliveryStatus = pgEnum("mail_campaign_delivery_status", [
	"sending",
	"failed",
	"sent",
]);

export const mailCampaigns = pgTable(
	"mail_campaigns",
	{
		id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
		name: text("name").notNull(),
		round: competitionRound("round").notNull(),
		registrationStatuses: registrationStatus("registration_statuses").array().notNull(),
		eliminationFilter: mailCampaignEliminationFilter("elimination_filter").default("any").notNull(),
		submissionFilter: mailCampaignSubmissionFilter("submission_filter").default("any").notNull(),
		preferenceStatuses: roundOnePreferenceStatus("preference_statuses").array().notNull(),
		assignedTrackIds: text("assigned_track_ids").array().notNull(),
		admissionMethods: roundOneAdmissionMethod("admission_methods").array().notNull(),
		subjectTemplate: text("subject_template").notNull(),
		bodyTemplate: text("body_template").notNull(),
		createdByUserId: text("created_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("mail_campaigns_archived_updated_idx").on(table.archivedAt, table.updatedAt),
		index("mail_campaigns_round_idx").on(table.round),
	],
);

export const mailCampaignDeliveries = pgTable(
	"mail_campaign_deliveries",
	{
		id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
		campaignId: text("campaign_id").notNull().references(() => mailCampaigns.id, { onDelete: "cascade" }),
		teamId: text("team_id").notNull(),
		teamName: text("team_name").notNull(),
		toAddress: text("to_address").notNull(),
		cc: text("cc").array().notNull(),
		subject: text("subject").notNull(),
		text: text("text").notNull(),
		html: text("html").notNull(),
		status: mailCampaignDeliveryStatus("status").notNull(),
		attemptToken: text("attempt_token").notNull(),
		attemptCount: integer("attempt_count").default(0).notNull(),
		lastAttemptedAt: timestamp("last_attempted_at"),
		sentAt: timestamp("sent_at"),
		errorMessage: text("error_message"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("mail_campaign_deliveries_campaign_team_unique_idx").on(table.campaignId, table.teamId),
		index("mail_campaign_deliveries_campaign_status_idx").on(table.campaignId, table.status),
		index("mail_campaign_deliveries_team_id_idx").on(table.teamId),
	],
);
