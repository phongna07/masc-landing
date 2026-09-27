import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const homeCountdownSettings = pgTable("home_countdown_settings", {
	id: text("id").primaryKey(),
	openAt: timestamp("open_at", { withTimezone: true }).notNull(),
	closeAt: timestamp("close_at", { withTimezone: true }).notNull(),
	applicationsEn: text("applications_en").notNull(),
	closesInEn: text("closes_in_en").notNull(),
	opensInEn: text("opens_in_en").notNull(),
	closedEn: text("closed_en").notNull(),
	applicationsVi: text("applications_vi").notNull(),
	closesInVi: text("closes_in_vi").notNull(),
	opensInVi: text("opens_in_vi").notNull(),
	closedVi: text("closed_vi").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	check("home_countdown_settings_singleton_check", sql`${table.id} = 'home'`),
	check("home_countdown_settings_date_order_check", sql`${table.openAt} < ${table.closeAt}`),
]);
