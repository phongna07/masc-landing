import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { preferencesSettings } from "./preferences-settings";

export const registrationStatus = pgEnum("registration_status", [
  "pending",
  "approved",
  "rejected",
]);

export const competitionRound = pgEnum("competition_round", ["0.5", "1", "2", "3"]);

export const roundOneAdmissionMethod = pgEnum("round_one_admission_method", [
  "cv_screening",
  "round_0_5_promotion",
]);

export const roundOnePreferenceStatus = pgEnum("round_one_preference_status", [
  "not_submitted",
  "submitted",
  "assigned",
]);

export const registrationAwarenessSource = pgEnum("registration_awareness_source", [
  "masc_fanpage",
  "masc_community_group",
  "other_facebook_group",
  "other_organization_fanpage",
  "media_ambassador",
]);

export const teams = pgTable(
  "teams",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    teamName: text("team_name").notNull(),
    registrationStatus: registrationStatus("registration_status")
      .default("pending")
      .notNull(),
    isEliminated: boolean("is_eliminated").default(false).notNull(),
    approvalSequence: integer("approval_sequence").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    captainId: text("captain_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" })
      .unique(),
    captainPhone: text("captain_phone").notNull(),
    awarenessSource: registrationAwarenessSource("awareness_source"),
    awarenessSourceDetail: text("awareness_source_detail"),
  },
  (table) => [index("teams_registration_status_idx").on(table.registrationStatus)],
);

export const members = pgTable(
  "members",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    birthdate: date("birth_date", { mode: "string" }).notNull(),
    universityName: text("university_name").notNull(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    isCaptain: boolean("is_captain").default(false).notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
  },
  (table) => [
    index("members_team_id_idx").on(table.teamId),
    uniqueIndex("members_email_unique_idx").on(sql`lower(${table.email})`),
    uniqueIndex("members_one_captain_per_team_idx")
      .on(table.teamId)
      .where(sql`${table.isCaptain} = true`),
  ],
);

export const roundOneTeams = pgTable(
  "round_1_teams",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    teamName: text("team_name").notNull(),
    registrationStatus: registrationStatus("registration_status").default("pending").notNull(),
    isEliminated: boolean("is_eliminated").default(false).notNull(),
    approvalSequence: integer("approval_sequence").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    captainId: text("captain_id").notNull().references(() => user.id, { onDelete: "restrict" }).unique(),
    captainPhone: text("captain_phone").notNull(),
    awarenessSource: registrationAwarenessSource("awareness_source"),
    awarenessSourceDetail: text("awareness_source_detail"),
    admissionMethod: roundOneAdmissionMethod("admission_method").notNull(),
    sourceRoundHalfTeamId: text("source_round_0_5_team_id").references(() => teams.id, { onDelete: "restrict" }),
    preferenceStatus: roundOnePreferenceStatus("preference_status").default("not_submitted").notNull(),
    preferences: text("preferences").array().default(sql`'{}'::text[]`).notNull(),
    preferenceSubmittedAt: timestamp("preference_submitted_at"),
    assignedTrackId: text("assigned_track_id").references(() => preferencesSettings.id, { onDelete: "restrict" }),
    assignedAt: timestamp("assigned_at"),
  },
  (table) => [
    index("round_1_teams_registration_status_idx").on(table.registrationStatus),
    uniqueIndex("round_1_teams_source_round_0_5_unique_idx").on(table.sourceRoundHalfTeamId)
      .where(sql`${table.sourceRoundHalfTeamId} is not null`),
    check("round_1_teams_admission_source_check", sql`(
      (${table.admissionMethod} = 'cv_screening' and ${table.sourceRoundHalfTeamId} is null) or
      (${table.admissionMethod} = 'round_0_5_promotion' and ${table.sourceRoundHalfTeamId} is not null)
    )`),
    index("round_1_teams_preference_status_idx").on(table.preferenceStatus, table.preferenceSubmittedAt),
    check("round_1_teams_preferences_distinct_check", sql`(
      cardinality(${table.preferences}) = 0 or (
        cardinality(${table.preferences}) = 3 and
        ${table.preferences}[1] <> ${table.preferences}[2] and
        ${table.preferences}[1] <> ${table.preferences}[3] and
        ${table.preferences}[2] <> ${table.preferences}[3]
      )
    )`),
    check("round_1_teams_preference_state_check", sql`(
      (${table.preferenceStatus} = 'not_submitted' and cardinality(${table.preferences}) = 0
        and ${table.preferenceSubmittedAt} is null and ${table.assignedTrackId} is null and ${table.assignedAt} is null) or
      (${table.preferenceStatus} = 'submitted' and cardinality(${table.preferences}) = 3
        and ${table.preferenceSubmittedAt} is not null and ${table.assignedTrackId} is null and ${table.assignedAt} is null) or
      (${table.preferenceStatus} = 'assigned' and cardinality(${table.preferences}) = 3
        and ${table.preferenceSubmittedAt} is not null and ${table.assignedTrackId} is not null
        and ${table.assignedTrackId} = any(${table.preferences}) and ${table.assignedAt} is not null)
    )`),
  ],
);

export const roundOneMembers = pgTable(
  "round_1_members",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    birthdate: date("birth_date", { mode: "string" }).notNull(),
    universityName: text("university_name").notNull(),
    teamId: text("team_id").notNull().references(() => roundOneTeams.id, { onDelete: "cascade" }),
    isCaptain: boolean("is_captain").default(false).notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
  },
  (table) => [
    index("round_1_members_team_id_idx").on(table.teamId),
    uniqueIndex("round_1_members_email_unique_idx").on(sql`lower(${table.email})`),
    uniqueIndex("round_1_members_one_captain_per_team_idx").on(table.teamId)
      .where(sql`${table.isCaptain} = true`),
  ],
);

export const roundOneMemberCvs = pgTable(
  "round_1_member_cvs",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    memberId: text("member_id").notNull().references(() => roundOneMembers.id, { onDelete: "cascade" }).unique(),
    objectKey: text("object_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [check("round_1_member_cvs_file_size_check", sql`${table.fileSize} > 0`)],
);

export const roundTwoTeams = pgTable(
  "round_2_teams",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    teamName: text("team_name").notNull(),
    registrationStatus: registrationStatus("registration_status").default("approved").notNull(),
    isEliminated: boolean("is_eliminated").default(false).notNull(),
    approvalSequence: integer("approval_sequence").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    captainId: text("captain_id").notNull().references(() => user.id, { onDelete: "restrict" }).unique(),
    captainPhone: text("captain_phone").notNull(),
    awarenessSource: registrationAwarenessSource("awareness_source"),
    awarenessSourceDetail: text("awareness_source_detail"),
    sourceRoundHalfTeamId: text("source_round_0_5_team_id").references(() => teams.id, { onDelete: "restrict" }),
    sourceRoundOneTeamId: text("source_round_1_team_id").references(() => roundOneTeams.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("round_2_teams_registration_status_idx").on(table.registrationStatus),
    uniqueIndex("round_2_teams_source_round_0_5_unique_idx").on(table.sourceRoundHalfTeamId)
      .where(sql`${table.sourceRoundHalfTeamId} is not null`),
    uniqueIndex("round_2_teams_source_round_1_unique_idx").on(table.sourceRoundOneTeamId)
      .where(sql`${table.sourceRoundOneTeamId} is not null`),
    check("round_2_teams_exactly_one_source_check", sql`num_nonnulls(${table.sourceRoundHalfTeamId}, ${table.sourceRoundOneTeamId}) = 1`),
  ],
);

export const roundTwoMembers = pgTable(
  "round_2_members",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    birthdate: date("birth_date", { mode: "string" }).notNull(),
    universityName: text("university_name").notNull(),
    teamId: text("team_id").notNull().references(() => roundTwoTeams.id, { onDelete: "cascade" }),
    isCaptain: boolean("is_captain").default(false).notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
  },
  (table) => [
    index("round_2_members_team_id_idx").on(table.teamId),
    uniqueIndex("round_2_members_email_unique_idx").on(sql`lower(${table.email})`),
    uniqueIndex("round_2_members_one_captain_per_team_idx").on(table.teamId).where(sql`${table.isCaptain} = true`),
  ],
);

export const roundThreeTeams = pgTable(
  "round_3_teams",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    teamName: text("team_name").notNull(),
    registrationStatus: registrationStatus("registration_status").default("approved").notNull(),
    isEliminated: boolean("is_eliminated").default(false).notNull(),
    approvalSequence: integer("approval_sequence").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    captainId: text("captain_id").notNull().references(() => user.id, { onDelete: "restrict" }).unique(),
    captainPhone: text("captain_phone").notNull(),
    awarenessSource: registrationAwarenessSource("awareness_source"),
    awarenessSourceDetail: text("awareness_source_detail"),
    sourceRoundTwoTeamId: text("source_round_2_team_id").notNull()
      .references(() => roundTwoTeams.id, { onDelete: "restrict" }).unique(),
  },
  (table) => [index("round_3_teams_registration_status_idx").on(table.registrationStatus)],
);

export const roundThreeMembers = pgTable(
  "round_3_members",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    birthdate: date("birth_date", { mode: "string" }).notNull(),
    universityName: text("university_name").notNull(),
    teamId: text("team_id").notNull().references(() => roundThreeTeams.id, { onDelete: "cascade" }),
    isCaptain: boolean("is_captain").default(false).notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
  },
  (table) => [
    index("round_3_members_team_id_idx").on(table.teamId),
    uniqueIndex("round_3_members_email_unique_idx").on(sql`lower(${table.email})`),
    uniqueIndex("round_3_members_one_captain_per_team_idx").on(table.teamId).where(sql`${table.isCaptain} = true`),
  ],
);

export const roundSubmissions = pgTable(
  "round_submissions",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    round: text("round").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    submittedByMemberId: text("submitted_by_member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    feedback: text("feedback"),
    score: doublePrecision("score"),
    feedbackPublished: boolean("feedback_published").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("round_submissions_team_id_round_attempt_unique_idx").on(table.teamId, table.round, table.attemptNumber),
    check("round_submissions_attempt_number_check", sql`${table.attemptNumber} between 1 and 3`),
    check("round_submissions_score_check", sql`${table.score} >= 0`),
    index("round_submissions_round_updated_at_idx").on(table.round, table.updatedAt),
    check("round_submissions_round_0_5_only_check", sql`${table.round} = '0.5'`),
  ],
);

export const roundOneSubmissions = pgTable(
  "round_1_submissions",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    teamId: text("team_id").notNull().references(() => roundOneTeams.id, { onDelete: "cascade" }),
    round: text("round").default("1").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    submittedByMemberId: text("submitted_by_member_id").notNull().references(() => roundOneMembers.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    feedback: text("feedback"),
    score: doublePrecision("score"),
    feedbackPublished: boolean("feedback_published").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("round_1_submissions_team_attempt_unique_idx").on(table.teamId, table.attemptNumber),
    check("round_1_submissions_attempt_number_check", sql`${table.attemptNumber} between 1 and 3`),
    check("round_1_submissions_score_check", sql`${table.score} >= 0`),
    index("round_1_submissions_updated_at_idx").on(table.updatedAt),
    check("round_1_submissions_round_check", sql`${table.round} = '1'`),
  ],
);

export const roundTwoSubmissions = pgTable(
  "round_2_submissions",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    teamId: text("team_id").notNull().references(() => roundTwoTeams.id, { onDelete: "cascade" }),
    round: text("round").default("2").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    submittedByMemberId: text("submitted_by_member_id").notNull().references(() => roundTwoMembers.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    feedback: text("feedback"),
    score: doublePrecision("score"),
    feedbackPublished: boolean("feedback_published").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("round_2_submissions_team_attempt_unique_idx").on(table.teamId, table.attemptNumber),
    check("round_2_submissions_attempt_number_check", sql`${table.attemptNumber} between 1 and 3`),
    check("round_2_submissions_score_check", sql`${table.score} >= 0`),
    index("round_2_submissions_updated_at_idx").on(table.updatedAt),
    check("round_2_submissions_round_check", sql`${table.round} = '2'`),
  ],
);

export const roundThreeSubmissions = pgTable(
  "round_3_submissions",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    teamId: text("team_id").notNull().references(() => roundThreeTeams.id, { onDelete: "cascade" }),
    round: text("round").default("3").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    submittedByMemberId: text("submitted_by_member_id").notNull().references(() => roundThreeMembers.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    feedback: text("feedback"),
    score: doublePrecision("score"),
    feedbackPublished: boolean("feedback_published").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("round_3_submissions_team_attempt_unique_idx").on(table.teamId, table.attemptNumber),
    check("round_3_submissions_attempt_number_check", sql`${table.attemptNumber} between 1 and 3`),
    check("round_3_submissions_score_check", sql`${table.score} >= 0`),
    index("round_3_submissions_updated_at_idx").on(table.updatedAt),
    check("round_3_submissions_round_check", sql`${table.round} = '3'`),
  ],
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
  captain: one(user, {
    fields: [teams.captainId],
    references: [user.id],
  }),
  members: many(members),
  roundSubmissions: many(roundSubmissions),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  team: one(teams, {
    fields: [members.teamId],
    references: [teams.id],
  }),
  roundSubmissions: many(roundSubmissions),
}));

export const roundSubmissionsRelations = relations(roundSubmissions, ({ one }) => ({
  team: one(teams, {
    fields: [roundSubmissions.teamId],
    references: [teams.id],
  }),
  submittedBy: one(members, {
    fields: [roundSubmissions.submittedByMemberId],
    references: [members.id],
  }),
}));
