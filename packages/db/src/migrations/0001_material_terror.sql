DROP INDEX "email_queue_approval_member_unique_idx";--> statement-breakpoint
ALTER TABLE "email_queue" ADD COLUMN "cc" text[] NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "email_queue_approval_unique_idx" ON "email_queue" USING btree ("team_id","event_type","approval_sequence");