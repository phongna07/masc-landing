CREATE TYPE "public"."competition_round" AS ENUM('0.5', '1', '2', '3');
--> statement-breakpoint
CREATE TYPE "public"."round_one_admission_method" AS ENUM('cv_screening', 'round_0_5_promotion');
--> statement-breakpoint
CREATE TABLE "admission_settings" (
	"round" text PRIMARY KEY NOT NULL,
	"is_open" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "admission_settings" ("round", "is_open") VALUES ('0.5', true), ('1', false)
ON CONFLICT ("round") DO NOTHING;
--> statement-breakpoint
CREATE TABLE "round_1_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"team_name" text NOT NULL,
	"registration_status" "registration_status" DEFAULT 'pending' NOT NULL,
	"approval_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"captain_id" text NOT NULL,
	"captain_phone" text NOT NULL,
	"awareness_source" "registration_awareness_source",
	"awareness_source_detail" text,
	"admission_method" "round_one_admission_method" NOT NULL,
	"source_round_0_5_team_id" text,
	CONSTRAINT "round_1_teams_captain_id_unique" UNIQUE("captain_id"),
	CONSTRAINT "round_1_teams_admission_source_check" CHECK ((
		("admission_method" = 'cv_screening' and "source_round_0_5_team_id" is null) or
		("admission_method" = 'round_0_5_promotion' and "source_round_0_5_team_id" is not null)
	))
);
--> statement-breakpoint
CREATE TABLE "round_1_members" (
	"id" text PRIMARY KEY NOT NULL,
	"birth_date" date NOT NULL,
	"university_name" text NOT NULL,
	"team_id" text NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_1_member_cvs" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "round_1_member_cvs_member_id_unique" UNIQUE("member_id"),
	CONSTRAINT "round_1_member_cvs_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "round_1_member_cvs_file_size_check" CHECK ("file_size" between 1 and 10485760)
);
--> statement-breakpoint
CREATE TABLE "round_1_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round" text DEFAULT '1' NOT NULL,
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
	CONSTRAINT "round_1_submissions_attempt_number_check" CHECK ("attempt_number" between 1 and 3),
	CONSTRAINT "round_1_submissions_score_check" CHECK ("score" >= 0),
	CONSTRAINT "round_1_submissions_round_check" CHECK ("round" = '1')
);
--> statement-breakpoint
CREATE TABLE "round_2_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"team_name" text NOT NULL,
	"registration_status" "registration_status" DEFAULT 'approved' NOT NULL,
	"approval_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"captain_id" text NOT NULL,
	"captain_phone" text NOT NULL,
	"awareness_source" "registration_awareness_source",
	"awareness_source_detail" text,
	"source_round_0_5_team_id" text,
	"source_round_1_team_id" text,
	CONSTRAINT "round_2_teams_captain_id_unique" UNIQUE("captain_id"),
	CONSTRAINT "round_2_teams_exactly_one_source_check" CHECK (num_nonnulls("source_round_0_5_team_id", "source_round_1_team_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "round_2_members" (
	"id" text PRIMARY KEY NOT NULL,
	"birth_date" date NOT NULL,
	"university_name" text NOT NULL,
	"team_id" text NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_2_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round" text DEFAULT '2' NOT NULL,
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
	CONSTRAINT "round_2_submissions_attempt_number_check" CHECK ("attempt_number" between 1 and 3),
	CONSTRAINT "round_2_submissions_score_check" CHECK ("score" >= 0),
	CONSTRAINT "round_2_submissions_round_check" CHECK ("round" = '2')
);
--> statement-breakpoint
CREATE TABLE "round_3_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"team_name" text NOT NULL,
	"registration_status" "registration_status" DEFAULT 'approved' NOT NULL,
	"approval_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"captain_id" text NOT NULL,
	"captain_phone" text NOT NULL,
	"awareness_source" "registration_awareness_source",
	"awareness_source_detail" text,
	"source_round_2_team_id" text NOT NULL,
	CONSTRAINT "round_3_teams_captain_id_unique" UNIQUE("captain_id"),
	CONSTRAINT "round_3_teams_source_round_2_team_id_unique" UNIQUE("source_round_2_team_id")
);
--> statement-breakpoint
CREATE TABLE "round_3_members" (
	"id" text PRIMARY KEY NOT NULL,
	"birth_date" date NOT NULL,
	"university_name" text NOT NULL,
	"team_id" text NOT NULL,
	"is_captain" boolean DEFAULT false NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_3_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round" text DEFAULT '3' NOT NULL,
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
	CONSTRAINT "round_3_submissions_attempt_number_check" CHECK ("attempt_number" between 1 and 3),
	CONSTRAINT "round_3_submissions_score_check" CHECK ("score" >= 0),
	CONSTRAINT "round_3_submissions_round_check" CHECK ("round" = '3')
);
--> statement-breakpoint
ALTER TABLE "round_1_teams" ADD CONSTRAINT "round_1_teams_captain_id_user_id_fk" FOREIGN KEY ("captain_id") REFERENCES "user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "round_1_teams" ADD CONSTRAINT "round_1_teams_source_round_0_5_team_id_teams_id_fk" FOREIGN KEY ("source_round_0_5_team_id") REFERENCES "teams"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "round_1_members" ADD CONSTRAINT "round_1_members_team_id_round_1_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "round_1_teams"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "round_1_member_cvs" ADD CONSTRAINT "round_1_member_cvs_member_id_round_1_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "round_1_members"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "round_1_submissions" ADD CONSTRAINT "round_1_submissions_team_id_round_1_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "round_1_teams"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "round_1_submissions" ADD CONSTRAINT "round_1_submissions_submitted_by_member_id_round_1_members_id_fk" FOREIGN KEY ("submitted_by_member_id") REFERENCES "round_1_members"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "round_2_teams" ADD CONSTRAINT "round_2_teams_captain_id_user_id_fk" FOREIGN KEY ("captain_id") REFERENCES "user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "round_2_teams" ADD CONSTRAINT "round_2_teams_source_round_0_5_team_id_teams_id_fk" FOREIGN KEY ("source_round_0_5_team_id") REFERENCES "teams"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "round_2_teams" ADD CONSTRAINT "round_2_teams_source_round_1_team_id_round_1_teams_id_fk" FOREIGN KEY ("source_round_1_team_id") REFERENCES "round_1_teams"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "round_2_members" ADD CONSTRAINT "round_2_members_team_id_round_2_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "round_2_teams"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "round_2_submissions" ADD CONSTRAINT "round_2_submissions_team_id_round_2_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "round_2_teams"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "round_2_submissions" ADD CONSTRAINT "round_2_submissions_submitted_by_member_id_round_2_members_id_fk" FOREIGN KEY ("submitted_by_member_id") REFERENCES "round_2_members"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "round_3_teams" ADD CONSTRAINT "round_3_teams_captain_id_user_id_fk" FOREIGN KEY ("captain_id") REFERENCES "user"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "round_3_teams" ADD CONSTRAINT "round_3_teams_source_round_2_team_id_round_2_teams_id_fk" FOREIGN KEY ("source_round_2_team_id") REFERENCES "round_2_teams"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "round_3_members" ADD CONSTRAINT "round_3_members_team_id_round_3_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "round_3_teams"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "round_3_submissions" ADD CONSTRAINT "round_3_submissions_team_id_round_3_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "round_3_teams"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "round_3_submissions" ADD CONSTRAINT "round_3_submissions_submitted_by_member_id_round_3_members_id_fk" FOREIGN KEY ("submitted_by_member_id") REFERENCES "round_3_members"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX "round_1_teams_registration_status_idx" ON "round_1_teams" ("registration_status");
--> statement-breakpoint
CREATE UNIQUE INDEX "round_1_teams_source_round_0_5_unique_idx" ON "round_1_teams" ("source_round_0_5_team_id") WHERE "source_round_0_5_team_id" is not null;
--> statement-breakpoint
CREATE INDEX "round_1_members_team_id_idx" ON "round_1_members" ("team_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "round_1_members_email_unique_idx" ON "round_1_members" (lower("email"));
--> statement-breakpoint
CREATE UNIQUE INDEX "round_1_members_one_captain_per_team_idx" ON "round_1_members" ("team_id") WHERE "is_captain" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX "round_1_submissions_team_attempt_unique_idx" ON "round_1_submissions" ("team_id", "attempt_number");
--> statement-breakpoint
CREATE INDEX "round_1_submissions_updated_at_idx" ON "round_1_submissions" ("updated_at");
--> statement-breakpoint
CREATE INDEX "round_2_teams_registration_status_idx" ON "round_2_teams" ("registration_status");
--> statement-breakpoint
CREATE UNIQUE INDEX "round_2_teams_source_round_0_5_unique_idx" ON "round_2_teams" ("source_round_0_5_team_id") WHERE "source_round_0_5_team_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "round_2_teams_source_round_1_unique_idx" ON "round_2_teams" ("source_round_1_team_id") WHERE "source_round_1_team_id" is not null;
--> statement-breakpoint
CREATE INDEX "round_2_members_team_id_idx" ON "round_2_members" ("team_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "round_2_members_email_unique_idx" ON "round_2_members" (lower("email"));
--> statement-breakpoint
CREATE UNIQUE INDEX "round_2_members_one_captain_per_team_idx" ON "round_2_members" ("team_id") WHERE "is_captain" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX "round_2_submissions_team_attempt_unique_idx" ON "round_2_submissions" ("team_id", "attempt_number");
--> statement-breakpoint
CREATE INDEX "round_2_submissions_updated_at_idx" ON "round_2_submissions" ("updated_at");
--> statement-breakpoint
CREATE INDEX "round_3_teams_registration_status_idx" ON "round_3_teams" ("registration_status");
--> statement-breakpoint
CREATE INDEX "round_3_members_team_id_idx" ON "round_3_members" ("team_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "round_3_members_email_unique_idx" ON "round_3_members" (lower("email"));
--> statement-breakpoint
CREATE UNIQUE INDEX "round_3_members_one_captain_per_team_idx" ON "round_3_members" ("team_id") WHERE "is_captain" = true;
--> statement-breakpoint
CREATE UNIQUE INDEX "round_3_submissions_team_attempt_unique_idx" ON "round_3_submissions" ("team_id", "attempt_number");
--> statement-breakpoint
CREATE INDEX "round_3_submissions_updated_at_idx" ON "round_3_submissions" ("updated_at");
--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM "round_submissions" WHERE "round" <> '0.5') THEN
		RAISE EXCEPTION 'round_submissions contains non-Round-0.5 rows; migrate them before applying this migration';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "round_submissions" ADD CONSTRAINT "round_submissions_round_0_5_only_check" CHECK ("round" = '0.5');
--> statement-breakpoint
ALTER TABLE "email_queue" ADD COLUMN "round" "competition_round" DEFAULT '0.5' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_queue" ADD COLUMN "team_name" text;
--> statement-breakpoint
ALTER TABLE "email_queue" ADD COLUMN "member_name" text;
--> statement-breakpoint
UPDATE "email_queue" AS q SET "team_name" = t."team_name", "member_name" = m."full_name"
FROM "teams" AS t, "members" AS m
WHERE q."team_id" = t."id" AND q."member_id" = m."id";
--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM "email_queue" WHERE "team_name" IS NULL OR "member_name" IS NULL) THEN
		RAISE EXCEPTION 'email_queue contains rows without matching Round 0.5 team/member snapshots';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "email_queue" ALTER COLUMN "team_name" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_queue" ALTER COLUMN "member_name" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_queue" DROP CONSTRAINT "email_queue_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "email_queue" DROP CONSTRAINT "email_queue_member_id_members_id_fk";
--> statement-breakpoint
DROP INDEX "email_queue_approval_unique_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "email_queue_approval_unique_idx" ON "email_queue" ("round", "team_id", "event_type", "approval_sequence");
