ALTER TABLE "mail_campaigns" ADD COLUMN "assigned_track_ids" text[];--> statement-breakpoint
UPDATE "mail_campaigns"
SET "assigned_track_ids" = COALESCE(
	(SELECT array_agg("id" ORDER BY "display_order", "created_at") FROM "preferences_settings"),
	ARRAY[]::text[]
);--> statement-breakpoint
ALTER TABLE "mail_campaigns" ALTER COLUMN "assigned_track_ids" SET NOT NULL;
