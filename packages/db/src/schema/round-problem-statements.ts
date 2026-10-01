import { sql } from "drizzle-orm";
import { bigint, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const roundProblemStatements = pgTable("round_problem_statements", {
	round: text("round").primaryKey(),
	objectKey: text("object_key").notNull().unique(),
	originalFilename: text("original_filename").notNull(),
	mimeType: text("mime_type").notNull(),
	fileSize: bigint("file_size", { mode: "number" }).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
	check("round_problem_statements_round_check", sql`${table.round} in ('2', '3')`),
	check("round_problem_statements_file_check", sql`${table.mimeType} = 'application/pdf' and ${table.fileSize} > 0 and ${table.fileSize} <= 209715200`),
]);
