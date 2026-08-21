CREATE TYPE "public"."round_one_preference_status" AS ENUM('not_submitted', 'submitted', 'assigned');--> statement-breakpoint
CREATE TABLE "preferences_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "preferences_settings" ("id", "name", "display_order", "is_active") VALUES
	('round-1-product-growth', 'Product + Growth', 1, true),
	('round-1-societal-pr-marcom', 'Societal + Marketing Communications', 2, true),
	('round-1-market-research-trade', 'Market Research + Trade Marketing', 3, true)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "round_1_teams" ADD COLUMN "preference_status" "round_one_preference_status" DEFAULT 'not_submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE "round_1_teams" ADD COLUMN "preferences" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "round_1_teams" ADD COLUMN "preference_submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "round_1_teams" ADD COLUMN "assigned_track_id" text;--> statement-breakpoint
ALTER TABLE "round_1_teams" ADD COLUMN "assigned_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "preferences_settings_name_unique_idx" ON "preferences_settings" USING btree (lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "preferences_settings_order_idx" ON "preferences_settings" USING btree ("display_order","created_at");--> statement-breakpoint
ALTER TABLE "round_1_teams" ADD CONSTRAINT "round_1_teams_assigned_track_id_preferences_settings_id_fk" FOREIGN KEY ("assigned_track_id") REFERENCES "public"."preferences_settings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "round_1_teams_preference_status_idx" ON "round_1_teams" USING btree ("preference_status","preference_submitted_at");--> statement-breakpoint
ALTER TABLE "round_1_teams" ADD CONSTRAINT "round_1_teams_preferences_distinct_check" CHECK ((
      cardinality("round_1_teams"."preferences") = 0 or (
        cardinality("round_1_teams"."preferences") = 3 and
        "round_1_teams"."preferences"[1] <> "round_1_teams"."preferences"[2] and
        "round_1_teams"."preferences"[1] <> "round_1_teams"."preferences"[3] and
        "round_1_teams"."preferences"[2] <> "round_1_teams"."preferences"[3]
      )
    ));--> statement-breakpoint
ALTER TABLE "round_1_teams" ADD CONSTRAINT "round_1_teams_preference_state_check" CHECK ((
      ("round_1_teams"."preference_status" = 'not_submitted' and cardinality("round_1_teams"."preferences") = 0
        and "round_1_teams"."preference_submitted_at" is null and "round_1_teams"."assigned_track_id" is null and "round_1_teams"."assigned_at" is null) or
      ("round_1_teams"."preference_status" = 'submitted' and cardinality("round_1_teams"."preferences") = 3
        and "round_1_teams"."preference_submitted_at" is not null and "round_1_teams"."assigned_track_id" is null and "round_1_teams"."assigned_at" is null) or
      ("round_1_teams"."preference_status" = 'assigned' and cardinality("round_1_teams"."preferences") = 3
        and "round_1_teams"."preference_submitted_at" is not null and "round_1_teams"."assigned_track_id" is not null
        and "round_1_teams"."assigned_track_id" = any("round_1_teams"."preferences") and "round_1_teams"."assigned_at" is not null)
    ));
