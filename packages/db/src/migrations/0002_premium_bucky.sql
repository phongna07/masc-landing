ALTER TABLE "round_submissions" ADD COLUMN "score" double precision;--> statement-breakpoint
ALTER TABLE "round_submissions" ADD CONSTRAINT "round_submissions_score_check" CHECK ("round_submissions"."score" >= 0);
