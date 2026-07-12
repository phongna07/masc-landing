CREATE TABLE "announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"object_key" text,
	"original_filename" text,
	"mime_type" text,
	"file_size" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "announcements_created_at_idx" ON "announcements" USING btree ("created_at");