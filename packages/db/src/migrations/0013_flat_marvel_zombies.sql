CREATE TABLE "admin_activity_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_email" text NOT NULL,
	"actor_role" text NOT NULL,
	"procedure_path" text NOT NULL,
	"procedure_type" text NOT NULL,
	"input" jsonb,
	"outcome" text NOT NULL,
	"error_code" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_activity_logs_created_at_id_idx" ON "admin_activity_logs" USING btree ("created_at","id");