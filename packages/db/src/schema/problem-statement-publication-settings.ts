import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const problemStatementPublicationSettings = pgTable("problem_statement_publication_settings", {
	round: text("round").primaryKey(),
	isPublished: boolean("is_published").default(false).notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
