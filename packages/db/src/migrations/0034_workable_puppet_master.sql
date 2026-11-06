ALTER TABLE "round_5_submissions" DROP CONSTRAINT "round_5_submissions_attempt_number_check";--> statement-breakpoint
ALTER TABLE "round_4_submissions" DROP CONSTRAINT "round_4_submissions_attempt_number_check";--> statement-breakpoint
ALTER TABLE "round_1_submissions" DROP CONSTRAINT "round_1_submissions_attempt_number_check";--> statement-breakpoint
ALTER TABLE "round_submissions" DROP CONSTRAINT "round_submissions_attempt_number_check";--> statement-breakpoint
ALTER TABLE "round_3_submissions" DROP CONSTRAINT "round_3_submissions_attempt_number_check";--> statement-breakpoint
ALTER TABLE "round_2_submissions" DROP CONSTRAINT "round_2_submissions_attempt_number_check";--> statement-breakpoint
ALTER TABLE "round_5_submissions" ADD CONSTRAINT "round_5_submissions_attempt_number_check" CHECK ("round_5_submissions"."attempt_number" between 1 and 5);--> statement-breakpoint
ALTER TABLE "round_4_submissions" ADD CONSTRAINT "round_4_submissions_attempt_number_check" CHECK ("round_4_submissions"."attempt_number" between 1 and 5);--> statement-breakpoint
ALTER TABLE "round_1_submissions" ADD CONSTRAINT "round_1_submissions_attempt_number_check" CHECK ("round_1_submissions"."attempt_number" between 1 and 5);--> statement-breakpoint
ALTER TABLE "round_submissions" ADD CONSTRAINT "round_submissions_attempt_number_check" CHECK ("round_submissions"."attempt_number" between 1 and 5);--> statement-breakpoint
ALTER TABLE "round_3_submissions" ADD CONSTRAINT "round_3_submissions_attempt_number_check" CHECK ("round_3_submissions"."attempt_number" between 1 and 5);--> statement-breakpoint
ALTER TABLE "round_2_submissions" ADD CONSTRAINT "round_2_submissions_attempt_number_check" CHECK ("round_2_submissions"."attempt_number" between 1 and 5);