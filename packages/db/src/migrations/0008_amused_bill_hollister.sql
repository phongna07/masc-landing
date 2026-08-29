CREATE TYPE "public"."mail_campaign_delivery_status" AS ENUM('sending', 'failed', 'sent');--> statement-breakpoint
CREATE TYPE "public"."mail_campaign_elimination_filter" AS ENUM('any', 'active', 'eliminated');--> statement-breakpoint
CREATE TYPE "public"."mail_campaign_submission_filter" AS ENUM('any', 'submitted', 'not_submitted');--> statement-breakpoint
CREATE TABLE "mail_campaign_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"to_address" text NOT NULL,
	"cc" text[] NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"html" text NOT NULL,
	"status" "mail_campaign_delivery_status" NOT NULL,
	"attempt_token" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempted_at" timestamp,
	"sent_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"round" "competition_round" NOT NULL,
	"registration_statuses" "registration_status"[] NOT NULL,
	"elimination_filter" "mail_campaign_elimination_filter" DEFAULT 'any' NOT NULL,
	"submission_filter" "mail_campaign_submission_filter" DEFAULT 'any' NOT NULL,
	"preference_statuses" "round_one_preference_status"[] NOT NULL,
	"admission_methods" "round_one_admission_method"[] NOT NULL,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_campaign_deliveries" ADD CONSTRAINT "mail_campaign_deliveries_campaign_id_mail_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."mail_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_campaigns" ADD CONSTRAINT "mail_campaigns_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_campaign_deliveries_campaign_team_unique_idx" ON "mail_campaign_deliveries" USING btree ("campaign_id","team_id");--> statement-breakpoint
CREATE INDEX "mail_campaign_deliveries_campaign_status_idx" ON "mail_campaign_deliveries" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "mail_campaign_deliveries_team_id_idx" ON "mail_campaign_deliveries" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "mail_campaigns_archived_updated_idx" ON "mail_campaigns" USING btree ("archived_at","updated_at");--> statement-breakpoint
CREATE INDEX "mail_campaigns_round_idx" ON "mail_campaigns" USING btree ("round");