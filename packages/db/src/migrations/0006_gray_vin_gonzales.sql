ALTER TABLE "round_1_teams" ADD COLUMN "is_eliminated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "round_3_teams" ADD COLUMN "is_eliminated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "round_2_teams" ADD COLUMN "is_eliminated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "is_eliminated" boolean DEFAULT false NOT NULL;