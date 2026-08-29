CREATE TABLE "problem_statement_publication_settings" (
	"round" text PRIMARY KEY NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "preferences_settings" ADD COLUMN "description" text;