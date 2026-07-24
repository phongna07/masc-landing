CREATE TYPE "public"."registration_awareness_source" AS ENUM(
	'masc_fanpage',
	'masc_community_group',
	'other_facebook_group',
	'other_organization_fanpage',
	'media_ambassador'
);
--> statement-breakpoint
ALTER TABLE "teams"
	ADD COLUMN "awareness_source" "registration_awareness_source",
	ADD COLUMN "awareness_source_detail" text;
