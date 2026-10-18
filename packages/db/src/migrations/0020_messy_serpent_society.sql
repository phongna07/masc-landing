ALTER TABLE "ticket_orders" ADD COLUMN "provider_status" text;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "checkout_closed_at" timestamp with time zone;