import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { account, session, user } from "./auth";

export const userAnnouncementType = pgEnum("user_announcement_type", ["team_promoted"]);

export const userAnnouncements = pgTable(
  "user_announcements",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: userAnnouncementType("type").notNull(),
    promotedRound: integer("promoted_round").notNull(),
    teamName: text("team_name").notNull(),
    sourceKey: text("source_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    check("user_announcements_promoted_round_check", sql`${table.promotedRound} in (1, 2, 3)`),
    index("user_announcements_user_created_at_idx").on(table.userId, table.createdAt),
    uniqueIndex("user_announcements_user_source_unique_idx").on(table.userId, table.sourceKey),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  announcements: many(userAnnouncements),
}));

export const userAnnouncementsRelations = relations(userAnnouncements, ({ one }) => ({
  user: one(user, {
    fields: [userAnnouncements.userId],
    references: [user.id],
  }),
}));
