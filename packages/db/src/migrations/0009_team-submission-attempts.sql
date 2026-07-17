ALTER TABLE "round_submissions" ADD COLUMN "attempt_number" integer;
--> statement-breakpoint
ALTER TABLE "round_submissions" ADD COLUMN "submitted_by_member_id" text;
--> statement-breakpoint
UPDATE "round_submissions" SET "attempt_number" = 1;
--> statement-breakpoint
UPDATE "round_submissions" AS "submission"
SET "submitted_by_member_id" = "captain"."id"
FROM "members" AS "captain"
WHERE "captain"."team_id" = "submission"."team_id"
  AND "captain"."is_captain" = true;
--> statement-breakpoint
ALTER TABLE "round_submissions" ALTER COLUMN "attempt_number" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "round_submissions" ALTER COLUMN "submitted_by_member_id" SET NOT NULL;
--> statement-breakpoint
DROP INDEX "round_submissions_team_id_round_unique_idx";
--> statement-breakpoint
ALTER TABLE "round_submissions" ADD CONSTRAINT "round_submissions_submitted_by_member_id_members_id_fk" FOREIGN KEY ("submitted_by_member_id") REFERENCES "public"."members"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "round_submissions_team_id_round_attempt_unique_idx" ON "round_submissions" USING btree ("team_id", "round", "attempt_number");
--> statement-breakpoint
ALTER TABLE "round_submissions" ADD CONSTRAINT "round_submissions_attempt_number_check" CHECK ("round_submissions"."attempt_number" between 1 and 3);
