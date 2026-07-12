import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
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
  "waitlisted",
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

export const roundOneSubmissions = pgTable(
  "round_one_submissions",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("round_one_submissions_team_id_unique_idx").on(table.teamId)],
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
  captain: one(user, {
    fields: [teams.captainId],
    references: [user.id],
  }),
  members: many(members),
  roundOneSubmission: one(roundOneSubmissions),
}));

export const membersRelations = relations(members, ({ one }) => ({
  team: one(teams, {
    fields: [members.teamId],
    references: [teams.id],
  }),
}));

export const roundOneSubmissionsRelations = relations(roundOneSubmissions, ({ one }) => ({
  team: one(teams, {
    fields: [roundOneSubmissions.teamId],
    references: [teams.id],
  }),
}));
