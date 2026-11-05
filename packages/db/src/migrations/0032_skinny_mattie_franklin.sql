ALTER TYPE "public"."competition_round" ADD VALUE '4';--> statement-breakpoint
ALTER TYPE "public"."competition_round" ADD VALUE '5';--> statement-breakpoint
CREATE TABLE "round_5_members" (
	"id" text PRIMARY KEY NOT NULL,
	"birth_date" date NOT NULL,
	"university_name" text NOT NULL,
	"team_id" text NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_5_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round" text DEFAULT '5' NOT NULL,
	"attempt_number" integer NOT NULL,
	"submitted_by_member_id" text NOT NULL,
	"description" text NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint NOT NULL,
	"feedback" text,
	"score" double precision,
	"feedback_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "round_5_submissions_attempt_number_check" CHECK ("round_5_submissions"."attempt_number" between 1 and 3),
	CONSTRAINT "round_5_submissions_score_check" CHECK ("round_5_submissions"."score" >= 0),
	CONSTRAINT "round_5_submissions_round_check" CHECK ("round_5_submissions"."round" = '5')
);
--> statement-breakpoint
CREATE TABLE "round_5_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"team_name" text NOT NULL,
	"registration_status" "registration_status" DEFAULT 'approved' NOT NULL,
	"is_eliminated" boolean DEFAULT false NOT NULL,
	"approval_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"captain_id" text NOT NULL,
	"captain_phone" text NOT NULL,
	"awareness_source" "registration_awareness_source",
	"awareness_source_detail" text,
	"source_round_4_team_id" text NOT NULL,
	CONSTRAINT "round_5_teams_captain_id_unique" UNIQUE("captain_id"),
	CONSTRAINT "round_5_teams_source_round_4_team_id_unique" UNIQUE("source_round_4_team_id")
);
--> statement-breakpoint
CREATE TABLE "round_4_members" (
	"id" text PRIMARY KEY NOT NULL,
	"birth_date" date NOT NULL,
	"university_name" text NOT NULL,
	"team_id" text NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_4_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round" text DEFAULT '4' NOT NULL,
	"attempt_number" integer NOT NULL,
	"submitted_by_member_id" text NOT NULL,
	"description" text NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint NOT NULL,
	"feedback" text,
	"score" double precision,
	"feedback_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "round_4_submissions_attempt_number_check" CHECK ("round_4_submissions"."attempt_number" between 1 and 3),
	CONSTRAINT "round_4_submissions_score_check" CHECK ("round_4_submissions"."score" >= 0),
	CONSTRAINT "round_4_submissions_round_check" CHECK ("round_4_submissions"."round" = '4')
);
--> statement-breakpoint
CREATE TABLE "round_4_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"team_name" text NOT NULL,
	"registration_status" "registration_status" DEFAULT 'approved' NOT NULL,
	"is_eliminated" boolean DEFAULT false NOT NULL,
	"approval_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"captain_id" text NOT NULL,
	"captain_phone" text NOT NULL,
	"awareness_source" "registration_awareness_source",
	"awareness_source_detail" text,
	"source_round_3_team_id" text NOT NULL,
	CONSTRAINT "round_4_teams_captain_id_unique" UNIQUE("captain_id"),
	CONSTRAINT "round_4_teams_source_round_3_team_id_unique" UNIQUE("source_round_3_team_id")
);
--> statement-breakpoint
ALTER TABLE "round_problem_statements" DROP CONSTRAINT "round_problem_statements_round_check";--> statement-breakpoint
ALTER TABLE "user_announcements" DROP CONSTRAINT "user_announcements_promoted_round_check";--> statement-breakpoint
ALTER TABLE "round_5_members" ADD CONSTRAINT "round_5_members_team_id_round_5_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."round_5_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_5_submissions" ADD CONSTRAINT "round_5_submissions_team_id_round_5_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."round_5_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_5_submissions" ADD CONSTRAINT "round_5_submissions_submitted_by_member_id_round_5_members_id_fk" FOREIGN KEY ("submitted_by_member_id") REFERENCES "public"."round_5_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_5_teams" ADD CONSTRAINT "round_5_teams_captain_id_user_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_5_teams" ADD CONSTRAINT "round_5_teams_source_round_4_team_id_round_4_teams_id_fk" FOREIGN KEY ("source_round_4_team_id") REFERENCES "public"."round_4_teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_4_members" ADD CONSTRAINT "round_4_members_team_id_round_4_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."round_4_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_4_submissions" ADD CONSTRAINT "round_4_submissions_team_id_round_4_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."round_4_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_4_submissions" ADD CONSTRAINT "round_4_submissions_submitted_by_member_id_round_4_members_id_fk" FOREIGN KEY ("submitted_by_member_id") REFERENCES "public"."round_4_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_4_teams" ADD CONSTRAINT "round_4_teams_captain_id_user_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_4_teams" ADD CONSTRAINT "round_4_teams_source_round_3_team_id_round_3_teams_id_fk" FOREIGN KEY ("source_round_3_team_id") REFERENCES "public"."round_3_teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "round_5_members_team_id_idx" ON "round_5_members" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "round_5_members_email_unique_idx" ON "round_5_members" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "round_5_members_one_captain_per_team_idx" ON "round_5_members" USING btree ("team_id") WHERE "round_5_members"."is_captain" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "round_5_submissions_team_attempt_unique_idx" ON "round_5_submissions" USING btree ("team_id","attempt_number");--> statement-breakpoint
CREATE INDEX "round_5_submissions_updated_at_idx" ON "round_5_submissions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "round_5_teams_registration_status_idx" ON "round_5_teams" USING btree ("registration_status");--> statement-breakpoint
CREATE INDEX "round_4_members_team_id_idx" ON "round_4_members" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "round_4_members_email_unique_idx" ON "round_4_members" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "round_4_members_one_captain_per_team_idx" ON "round_4_members" USING btree ("team_id") WHERE "round_4_members"."is_captain" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "round_4_submissions_team_attempt_unique_idx" ON "round_4_submissions" USING btree ("team_id","attempt_number");--> statement-breakpoint
CREATE INDEX "round_4_submissions_updated_at_idx" ON "round_4_submissions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "round_4_teams_registration_status_idx" ON "round_4_teams" USING btree ("registration_status");--> statement-breakpoint
ALTER TABLE "round_problem_statements" ADD CONSTRAINT "round_problem_statements_round_check" CHECK ("round_problem_statements"."round" in ('2', '3', '4', '5'));--> statement-breakpoint
ALTER TABLE "user_announcements" ADD CONSTRAINT "user_announcements_promoted_round_check" CHECK ("user_announcements"."promoted_round" in (1, 2, 3, 4, 5));