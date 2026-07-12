import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const submissionSettings = pgTable("submission_settings", {
	round: text("round").primaryKey(),
	isOpen: boolean("is_open").default(false).notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
