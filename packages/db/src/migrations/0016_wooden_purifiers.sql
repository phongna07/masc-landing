CREATE TABLE "home_countdown_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"open_at" timestamp with time zone NOT NULL,
	"close_at" timestamp with time zone NOT NULL,
	"applications_en" text NOT NULL,
	"closes_in_en" text NOT NULL,
	"opens_in_en" text NOT NULL,
	"closed_en" text NOT NULL,
	"applications_vi" text NOT NULL,
	"closes_in_vi" text NOT NULL,
	"opens_in_vi" text NOT NULL,
	"closed_vi" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_countdown_settings_singleton_check" CHECK ("home_countdown_settings"."id" = 'home'),
	CONSTRAINT "home_countdown_settings_date_order_check" CHECK ("home_countdown_settings"."open_at" < "home_countdown_settings"."close_at")
);
--> statement-breakpoint
INSERT INTO "home_countdown_settings" (
	"id", "open_at", "close_at", "applications_en", "closes_in_en", "opens_in_en", "closed_en",
	"applications_vi", "closes_in_vi", "opens_in_vi", "closed_vi"
) VALUES (
	'home', '2026-10-03T00:00:00+07:00', '2026-10-11T00:00:00+07:00',
	'Round 2', 'Round 2 close in', 'Round 2 open in', 'Submissions closed',
	'Vòng 2', 'Thời gian kết thúc Vòng 2 còn', 'Vòng 2 mở sau', 'Đã đóng cổng nộp bài'
);
