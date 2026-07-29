CREATE TYPE "public"."user_announcement_type" AS ENUM('team_promoted');--> statement-breakpoint
CREATE TABLE "user_announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "user_announcement_type" NOT NULL,
	"promoted_round" integer NOT NULL,
	"team_name" text NOT NULL,
	"source_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_announcements_promoted_round_check" CHECK ("user_announcements"."promoted_round" in (1, 2, 3))
);
--> statement-breakpoint
ALTER TABLE "user_announcements" ADD CONSTRAINT "user_announcements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_announcements_user_created_at_idx" ON "user_announcements" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_announcements_user_source_unique_idx" ON "user_announcements" USING btree ("user_id","source_key");