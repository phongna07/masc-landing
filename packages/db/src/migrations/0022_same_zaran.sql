CREATE TABLE "ticket_template_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"config" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_template_settings_singleton" CHECK ("ticket_template_settings"."id" = 1),
	CONSTRAINT "ticket_template_revision_nonnegative" CHECK ("ticket_template_settings"."revision" >= 0)
);
