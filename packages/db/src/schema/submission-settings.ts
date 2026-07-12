import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const submissionSettings = pgTable("submission_settings", {
	id: text("id").primaryKey(),
	roundOneSubmissionOpen: boolean("round_one_submission_open").default(true).notNull(),
	roundTwoSubmissionOpen: boolean("round_two_submission_open").default(false).notNull(),
	roundThreeSubmissionOpen: boolean("round_three_submission_open").default(false).notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
