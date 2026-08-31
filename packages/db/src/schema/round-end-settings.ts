import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const roundEndSettings = pgTable("round_end_settings", {
	round: text("round").primaryKey(),
	isEnded: boolean("is_ended").default(false).notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
