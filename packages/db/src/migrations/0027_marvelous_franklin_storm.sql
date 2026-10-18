ALTER TABLE "ticket_orders" ADD COLUMN "referral_code" text;--> statement-breakpoint
CREATE INDEX "ticket_order_referral_idx" ON "ticket_orders" USING btree ("referral_code");--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_order_referral_format" CHECK ("ticket_orders"."referral_code" is null or "ticket_orders"."referral_code" ~ '^[A-Z0-9_-]{1,64}$');