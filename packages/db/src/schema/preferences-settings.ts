import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
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
		description: text("description"),
		displayOrder: integer("display_order").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		problemStatementObjectKey: text("problem_statement_object_key").unique(),
		problemStatementOriginalFilename: text("problem_statement_original_filename"),
		problemStatementMimeType: text("problem_statement_mime_type"),
		problemStatementFileSize: bigint("problem_statement_file_size", { mode: "number" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("preferences_settings_name_unique_idx").on(sql`lower(btrim(${table.name}))`),
		index("preferences_settings_order_idx").on(table.displayOrder, table.createdAt),
		check("preferences_settings_problem_statement_check", sql`(
			(${table.problemStatementObjectKey} is null
				and ${table.problemStatementOriginalFilename} is null
				and ${table.problemStatementMimeType} is null
				and ${table.problemStatementFileSize} is null)
			or
			(${table.problemStatementObjectKey} is not null
				and ${table.problemStatementOriginalFilename} is not null
				and ${table.problemStatementMimeType} is not null
				and ${table.problemStatementMimeType} = 'application/pdf'
				and ${table.problemStatementFileSize} is not null
				and ${table.problemStatementFileSize} > 0)
		)`),
	],
);
