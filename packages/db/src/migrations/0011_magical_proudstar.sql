ALTER TABLE "round_1_members" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "round_1_members" ADD COLUMN "facebook_profile_url" text;--> statement-breakpoint
UPDATE "round_1_members" AS "member"
SET "phone" = "team"."captain_phone"
FROM "round_1_teams" AS "team"
WHERE "member"."team_id" = "team"."id"
	AND "member"."is_captain" = true
	AND "member"."phone" IS NULL;
