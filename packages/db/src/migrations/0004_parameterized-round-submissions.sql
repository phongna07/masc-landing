CREATE TABLE "round_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round" text NOT NULL,
	"description" text NOT NULL,
	"object_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint NOT NULL,
	"feedback" text,
	"feedback_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "round_submissions" ADD CONSTRAINT "round_submissions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "round_submissions_team_id_round_unique_idx" ON "round_submissions" USING btree ("team_id", "round");
--> statement-breakpoint
CREATE INDEX "round_submissions_round_updated_at_idx" ON "round_submissions" USING btree ("round", "updated_at");
--> statement-breakpoint
INSERT INTO "round_submissions" ("id", "team_id", "round", "description", "object_key", "original_filename", "mime_type", "file_size", "feedback", "feedback_published", "created_at", "updated_at")
SELECT "id", "team_id", '1', "description", "object_key", "original_filename", "mime_type", "file_size", "feedback", "feedback_published", "created_at", "updated_at" FROM "round_one_submissions"
UNION ALL
SELECT "id", "team_id", '2', "description", "object_key", "original_filename", "mime_type", "file_size", "feedback", "feedback_published", "created_at", "updated_at" FROM "round_two_submissions"
UNION ALL
SELECT "id", "team_id", '3', "description", "object_key", "original_filename", "mime_type", "file_size", "feedback", "feedback_published", "created_at", "updated_at" FROM "round_three_submissions";
--> statement-breakpoint
DROP TABLE "round_one_submissions" CASCADE;
--> statement-breakpoint
DROP TABLE "round_two_submissions" CASCADE;
--> statement-breakpoint
DROP TABLE "round_three_submissions" CASCADE;
--> statement-breakpoint
CREATE TABLE "submission_settings_new" (
	"round" text PRIMARY KEY NOT NULL,
	"is_open" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "submission_settings_new" ("round", "is_open", "updated_at")
SELECT '0.5', true, COALESCE((SELECT "updated_at" FROM "submission_settings" WHERE "id" = 'global'), now())
UNION ALL SELECT '1', COALESCE((SELECT "round_one_submission_open" FROM "submission_settings" WHERE "id" = 'global'), true), COALESCE((SELECT "updated_at" FROM "submission_settings" WHERE "id" = 'global'), now())
UNION ALL SELECT '2', COALESCE((SELECT "round_two_submission_open" FROM "submission_settings" WHERE "id" = 'global'), false), COALESCE((SELECT "updated_at" FROM "submission_settings" WHERE "id" = 'global'), now())
UNION ALL SELECT '3', COALESCE((SELECT "round_three_submission_open" FROM "submission_settings" WHERE "id" = 'global'), false), COALESCE((SELECT "updated_at" FROM "submission_settings" WHERE "id" = 'global'), now());
--> statement-breakpoint
DROP TABLE "submission_settings";
--> statement-breakpoint
ALTER TABLE "submission_settings_new" RENAME TO "submission_settings";
