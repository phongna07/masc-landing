CREATE TABLE "round_end_settings" (
	"round" text PRIMARY KEY NOT NULL,
	"is_ended" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "round_end_settings" ("round", "is_ended") VALUES
	('0.5', false),
	('1', false),
	('2', false),
	('3', false);
