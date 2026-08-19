import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const preferencesSettings = pgTable(
	"preferences_settings",
	{
		id: text("id")
			.$defaultFn(() => crypto.randomUUID())
			.primaryKey(),
		name: text("name").notNull(),
		displayOrder: integer("display_order").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("preferences_settings_name_unique_idx").on(sql`lower(btrim(${table.name}))`),
		index("preferences_settings_order_idx").on(table.displayOrder, table.createdAt),
	],
);
