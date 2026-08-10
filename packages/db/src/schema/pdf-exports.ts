import { sql } from "drizzle-orm";
import {
	bigint,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { competitionRound } from "./registration";

export const pdfExportStatus = pgEnum("pdf_export_status", [
	"pending",
	"processing",
	"completed",
	"failed",
	"expired",
]);

export const pdfExportJobs = pgTable(
	"pdf_export_jobs",
	{
		id: text("id")
			.$defaultFn(() => crypto.randomUUID())
			.primaryKey(),
		round: competitionRound("round").notNull(),
		status: pdfExportStatus("status").default("pending").notNull(),
		requestedByUserId: text("requested_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "restrict" }),
		archiveObjectKey: text("archive_object_key"),
		archiveFilename: text("archive_filename"),
		fileCount: integer("file_count"),
		totalSourceBytes: bigint("total_source_bytes", { mode: "number" }),
		archiveBytes: bigint("archive_bytes", { mode: "number" }),
		errorMessage: text("error_message"),
		workerId: text("worker_id"),
		attemptCount: integer("attempt_count").default(0).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		startedAt: timestamp("started_at"),
		heartbeatAt: timestamp("heartbeat_at"),
		completedAt: timestamp("completed_at"),
		expiresAt: timestamp("expires_at"),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("pdf_export_jobs_status_created_at_idx").on(table.status, table.createdAt),
		index("pdf_export_jobs_expires_at_idx").on(table.expiresAt),
		uniqueIndex("pdf_export_jobs_one_active_round_idx")
			.on(table.round)
			.where(sql`${table.status} in ('pending', 'processing')`),
	],
);
