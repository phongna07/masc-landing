import { relations } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { members, teams } from "./registration";

export const emailStatus = pgEnum("email_status", ["pending", "sent", "failed"]);

export const emailQueue = pgTable(
  "email_queue",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    text: text("text").notNull(),
    html: text("html").notNull(),
    status: emailStatus("status").default("pending").notNull(),
    eventType: text("event_type").notNull(),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "restrict" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    approvalSequence: integer("approval_sequence").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastAttemptedAt: timestamp("last_attempted_at"),
    sentAt: timestamp("sent_at"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("email_queue_status_created_at_idx").on(table.status, table.createdAt),
    index("email_queue_team_id_idx").on(table.teamId),
    uniqueIndex("email_queue_approval_member_unique_idx").on(
      table.teamId,
      table.memberId,
      table.eventType,
      table.approvalSequence,
    ),
  ],
);

export const emailQueueRelations = relations(emailQueue, ({ one }) => ({
  team: one(teams, { fields: [emailQueue.teamId], references: [teams.id] }),
  member: one(members, { fields: [emailQueue.memberId], references: [members.id] }),
}));
