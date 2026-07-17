DELETE FROM "email_queue";
--> statement-breakpoint
DELETE FROM "teams";
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "birth_date" date NOT NULL;
