ALTER TABLE "round_one_submissions" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "round_one_submissions" ADD COLUMN "feedback_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "round_three_submissions" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "round_three_submissions" ADD COLUMN "feedback_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "round_two_submissions" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "round_two_submissions" ADD COLUMN "feedback_published" boolean DEFAULT false NOT NULL;