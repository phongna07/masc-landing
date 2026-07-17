CREATE TABLE "dashboard_tab_settings" (
	"round" text PRIMARY KEY NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
