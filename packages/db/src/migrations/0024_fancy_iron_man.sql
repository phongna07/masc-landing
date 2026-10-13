-- Existing orders must have real buyer contact details before this migration.
-- Do not fabricate names or phone numbers to satisfy these constraints.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "ticket_orders"
		WHERE "buyer_name" IS NULL OR "buyer_phone" IS NULL
			OR "buyer_name" !~ '[^[:space:]]' OR "buyer_phone" !~ '[^[:space:]]'
	) THEN
		RAISE EXCEPTION 'Correct missing or blank buyer names and phone numbers in ticket_orders before applying this migration';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "ticket_orders" ALTER COLUMN "buyer_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_orders" ALTER COLUMN "buyer_phone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_order_buyer_name_required" CHECK ("ticket_orders"."buyer_name" ~ '[^[:space:]]');--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_order_buyer_phone_required" CHECK ("ticket_orders"."buyer_phone" ~ '[^[:space:]]');