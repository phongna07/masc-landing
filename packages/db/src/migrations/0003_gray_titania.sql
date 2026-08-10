CREATE TYPE "public"."pdf_export_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "pdf_export_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"round" "competition_round" NOT NULL,
	"status" "pdf_export_status" DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"archive_object_key" text,
	"archive_filename" text,
	"file_count" integer,
	"total_source_bytes" bigint,
	"archive_bytes" bigint,
	"error_message" text,
	"worker_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"heartbeat_at" timestamp,
	"completed_at" timestamp,
	"expires_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pdf_export_jobs" ADD CONSTRAINT "pdf_export_jobs_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pdf_export_jobs_status_created_at_idx" ON "pdf_export_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "pdf_export_jobs_expires_at_idx" ON "pdf_export_jobs" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pdf_export_jobs_one_active_round_idx" ON "pdf_export_jobs" USING btree ("round") WHERE "pdf_export_jobs"."status" in ('pending', 'processing');