CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'failed');
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "approval_sequence" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE "email_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"html" text NOT NULL,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"event_type" text NOT NULL,
	"team_id" text NOT NULL,
	"member_id" text NOT NULL,
	"approval_sequence" integer NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempted_at" timestamp,
	"sent_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "email_queue_status_created_at_idx" ON "email_queue" USING btree ("status","created_at");
--> statement-breakpoint
CREATE INDEX "email_queue_team_id_idx" ON "email_queue" USING btree ("team_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "email_queue_approval_member_unique_idx" ON "email_queue" USING btree ("team_id","member_id","event_type","approval_sequence");
