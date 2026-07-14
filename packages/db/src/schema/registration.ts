import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const registrationStatus = pgEnum("registration_status", [
  "pending",
  "approved",
  "rejected",
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
    approvalSequence: integer("approval_sequence").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    captainId: text("captain_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" })
      .unique(),
    captainPhone: text("captain_phone").notNull(),
  },
  (table) => [index("teams_registration_status_idx").on(table.registrationStatus)],
);

export const members = pgTable(
  "members",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
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

export const roundSubmissions = pgTable(
  "round_submissions",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    round: text("round").notNull(),
    description: text("description").notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    feedback: text("feedback"),
    feedbackPublished: boolean("feedback_published").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("round_submissions_team_id_round_unique_idx").on(table.teamId, table.round),
    index("round_submissions_round_updated_at_idx").on(table.round, table.updatedAt),
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

export const membersRelations = relations(members, ({ one }) => ({
  team: one(teams, {
    fields: [members.teamId],
    references: [teams.id],
  }),
}));

export const roundSubmissionsRelations = relations(roundSubmissions, ({ one }) => ({
  team: one(teams, {
    fields: [roundSubmissions.teamId],
    references: [teams.id],
  }),
}));
