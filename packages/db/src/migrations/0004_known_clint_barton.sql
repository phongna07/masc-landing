CREATE TABLE "upload_limit_settings" (
	"kind" text PRIMARY KEY NOT NULL,
	"max_file_size" bigint NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "upload_limit_settings_kind_check" CHECK ("upload_limit_settings"."kind" in ('participant_cv', 'round_submission')),
	CONSTRAINT "upload_limit_settings_max_file_size_check" CHECK ("upload_limit_settings"."max_file_size" between 1048576 and 104857600)
);
--> statement-breakpoint
INSERT INTO "upload_limit_settings" ("kind", "max_file_size") VALUES
	('participant_cv', 10485760),
	('round_submission', 20971520)
ON CONFLICT ("kind") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "round_1_member_cvs" DROP CONSTRAINT "round_1_member_cvs_file_size_check";--> statement-breakpoint
ALTER TABLE "round_1_member_cvs" ADD CONSTRAINT "round_1_member_cvs_file_size_check" CHECK ("round_1_member_cvs"."file_size" > 0);
