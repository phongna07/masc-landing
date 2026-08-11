import { sql } from "drizzle-orm";
import { bigint, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const uploadLimitSettings = pgTable(
	"upload_limit_settings",
	{
		kind: text("kind").primaryKey(),
		maxFileSize: bigint("max_file_size", { mode: "number" }).notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		check(
			"upload_limit_settings_kind_check",
			sql`${table.kind} in ('participant_cv', 'round_submission')`,
		),
		check(
			"upload_limit_settings_max_file_size_check",
			sql`${table.maxFileSize} between 1048576 and 104857600`,
		),
	],
);
