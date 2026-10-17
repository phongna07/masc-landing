CREATE TABLE "ticket_promos" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"revision" text NOT NULL,
	"prices" jsonb NOT NULL,
	"total_limit" integer,
	"per_buyer_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_promos_code_unique" UNIQUE("code"),
	CONSTRAINT "ticket_promo_code_format" CHECK ("ticket_promos"."code" ~ '^[A-Z0-9_-]{1,64}$'),
	CONSTRAINT "ticket_promo_limits" CHECK (("ticket_promos"."total_limit" is null or "ticket_promos"."total_limit" > 0) and ("ticket_promos"."per_buyer_limit" is null or "ticket_promos"."per_buyer_limit" > 0)),
	CONSTRAINT "ticket_promo_prices" CHECK (jsonb_typeof("ticket_promos"."prices") = 'object' and "ticket_promos"."prices" ?& array['Silver', 'Golden', 'Platinum', 'VIP'] and jsonb_typeof("ticket_promos"."prices"->'Silver') = 'number' and (("ticket_promos"."prices"->>'Silver')::numeric = 0 or ("ticket_promos"."prices"->>'Silver')::numeric between 1000 and 1000000000) and ("ticket_promos"."prices"->>'Silver')::numeric = trunc(("ticket_promos"."prices"->>'Silver')::numeric) and jsonb_typeof("ticket_promos"."prices"->'Golden') = 'number' and (("ticket_promos"."prices"->>'Golden')::numeric = 0 or ("ticket_promos"."prices"->>'Golden')::numeric between 1000 and 1000000000) and ("ticket_promos"."prices"->>'Golden')::numeric = trunc(("ticket_promos"."prices"->>'Golden')::numeric) and jsonb_typeof("ticket_promos"."prices"->'Platinum') = 'number' and (("ticket_promos"."prices"->>'Platinum')::numeric = 0 or ("ticket_promos"."prices"->>'Platinum')::numeric between 1000 and 1000000000) and ("ticket_promos"."prices"->>'Platinum')::numeric = trunc(("ticket_promos"."prices"->>'Platinum')::numeric) and jsonb_typeof("ticket_promos"."prices"->'VIP') = 'number' and (("ticket_promos"."prices"->>'VIP')::numeric = 0 or ("ticket_promos"."prices"->>'VIP')::numeric between 1000 and 1000000000) and ("ticket_promos"."prices"->>'VIP')::numeric = trunc(("ticket_promos"."prices"->>'VIP')::numeric))
);
--> statement-breakpoint
ALTER TABLE "ticket_orders" DROP CONSTRAINT "ticket_order_snapshot_shape";--> statement-breakpoint
ALTER TABLE "ticket_audit" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "promo_id" text;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD COLUMN "promo_reservation" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_promo_id_ticket_promos_id_fk" FOREIGN KEY ("promo_id") REFERENCES "public"."ticket_promos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_order_promo_usage_idx" ON "ticket_orders" USING btree ("promo_id","promo_reservation","buyer_id");--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_order_promo_reservation" CHECK (("ticket_orders"."promo_id" is null and "ticket_orders"."promo_reservation" = 'none') or ("ticket_orders"."promo_id" is not null and "ticket_orders"."promo_reservation" in ('held', 'consumed', 'released') and "ticket_orders"."snapshot"->'promo' is not null));--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_order_snapshot_shape" CHECK ("ticket_orders"."snapshot"->>'currency' = 'VND' and (("ticket_orders"."snapshot"->>'totalPrice')::integer > 0 or (("ticket_orders"."snapshot"->>'totalPrice')::integer = 0 and "ticket_orders"."promo_id" is not null)) and (("ticket_orders"."snapshot"->>'packageName' = 'Silver' and "ticket_orders"."snapshot"->>'category' = 'normal' and ("ticket_orders"."snapshot"->>'quantity')::integer = 1) or ("ticket_orders"."snapshot"->>'packageName' = 'Golden' and "ticket_orders"."snapshot"->>'category' = 'normal' and ("ticket_orders"."snapshot"->>'quantity')::integer = 2) or ("ticket_orders"."snapshot"->>'packageName' = 'Platinum' and "ticket_orders"."snapshot"->>'category' = 'normal' and ("ticket_orders"."snapshot"->>'quantity')::integer = 3) or ("ticket_orders"."snapshot"->>'packageName' = 'VIP' and "ticket_orders"."snapshot"->>'category' = 'vip' and ("ticket_orders"."snapshot"->>'quantity')::integer = 1)));