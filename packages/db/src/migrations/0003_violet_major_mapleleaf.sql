CREATE TABLE "submission_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"round_one_submission_open" boolean DEFAULT true NOT NULL,
	"round_two_submission_open" boolean DEFAULT false NOT NULL,
	"round_three_submission_open" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "submission_settings" ("id", "round_one_submission_open", "round_two_submission_open", "round_three_submission_open")
VALUES ('global', true, false, false);
