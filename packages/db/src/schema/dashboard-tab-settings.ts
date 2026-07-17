import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const dashboardTabSettings = pgTable("dashboard_tab_settings", {
	round: text("round").primaryKey(),
	isVisible: boolean("is_visible").default(true).notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
