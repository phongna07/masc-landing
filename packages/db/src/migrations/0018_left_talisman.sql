ALTER TYPE "public"."admin_role" ADD VALUE 'entrance-staff';--> statement-breakpoint
CREATE TABLE "admission_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"category" text NOT NULL,
	"order_id" text,
	"batch_id" text,
	"owner_id" text,
	"ordinal" integer NOT NULL,
	"code" text NOT NULL,
	"validity" text DEFAULT 'valid' NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"event" jsonb NOT NULL,
	"recipient_name" text,
	"recipient_phone" text,
	"recipient_email" text,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"credential_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_tickets_code_unique" UNIQUE("code"),
	CONSTRAINT "ticket_source_ownership" CHECK (("admission_tickets"."source" = 'purchased' and "admission_tickets"."order_id" is not null and "admission_tickets"."owner_id" is not null and "admission_tickets"."batch_id" is null) or ("admission_tickets"."source" = 'gifted' and "admission_tickets"."batch_id" is not null and "admission_tickets"."order_id" is null and "admission_tickets"."owner_id" is null))
);
--> statement-breakpoint
CREATE TABLE "ticket_gift_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"category" text NOT NULL,
	"quantity" integer NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"event" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_gift_batches_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "gift_batch_bounded" CHECK ("ticket_gift_batches"."quantity" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "ticket_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_id" text,
	"reason" text,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_check_ins" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text,
	"actor_id" text NOT NULL,
	"request_key" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_credentials" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_email_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"order_id" text,
	"ticket_id" text,
	"to_address" text NOT NULL,
	"locale" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_email_jobs_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "ticket_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"buyer_id" text NOT NULL,
	"request_key" text NOT NULL,
	"provider_order_code" bigint NOT NULL,
	"payment_link_id" text,
	"checkout_url" text,
	"snapshot" jsonb NOT NULL,
	"buyer_email" text NOT NULL,
	"buyer_name" text,
	"buyer_phone" text,
	"locale" text NOT NULL,
	"payment_status" text DEFAULT 'creating' NOT NULL,
	"fulfillment_status" text DEFAULT 'pending' NOT NULL,
	"reservation" text DEFAULT 'none' NOT NULL,
	"settled_amount" integer DEFAULT 0 NOT NULL,
	"issue" text,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"create_attempted_at" timestamp with time zone,
	"reconcile_attempts" integer DEFAULT 0 NOT NULL,
	"next_reconcile_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reconcile_lease_until" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	CONSTRAINT "ticket_orders_provider_order_code_unique" UNIQUE("provider_order_code"),
	CONSTRAINT "ticket_orders_payment_link_id_unique" UNIQUE("payment_link_id"),
	CONSTRAINT "ticket_order_amount_nonnegative" CHECK ("ticket_orders"."settled_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ticket_packages" (
	"name" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"quantity" integer NOT NULL,
	"price" integer NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "ticket_package_positive_price" CHECK ("ticket_packages"."price" > 0),
	CONSTRAINT "ticket_package_shape" CHECK (("ticket_packages"."name" = 'Silver' and "ticket_packages"."quantity" = 1 and "ticket_packages"."category" = 'normal') or ("ticket_packages"."name" = 'Golden' and "ticket_packages"."quantity" = 2 and "ticket_packages"."category" = 'normal') or ("ticket_packages"."name" = 'Platinum' and "ticket_packages"."quantity" = 3 and "ticket_packages"."category" = 'normal') or ("ticket_packages"."name" = 'VIP' and "ticket_packages"."quantity" = 1 and "ticket_packages"."category" = 'vip'))
);
--> statement-breakpoint
CREATE TABLE "ticket_payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"order_id" text,
	"provider_order_code" bigint,
	"payment_link_id" text,
	"reference" text,
	"amount" integer,
	"currency" text,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_payment_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "ticket_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"request_key" text NOT NULL,
	"status" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"reference" text,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_refunds_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "ticket_refund_positive" CHECK ("ticket_refunds"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "ticket_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"is_sales_opened" boolean DEFAULT false NOT NULL,
	"vip_capacity" integer DEFAULT 30 NOT NULL,
	"event" jsonb DEFAULT '{"name":"Marketing All-Star Challenge 2026","date":null,"venue":null,"timezone":"Asia/Ho_Chi_Minh"}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_settings_singleton" CHECK ("ticket_settings"."id" = 1),
	CONSTRAINT "ticket_capacity_nonnegative" CHECK ("ticket_settings"."vip_capacity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "admission_tickets" ADD CONSTRAINT "admission_tickets_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_tickets" ADD CONSTRAINT "admission_tickets_batch_id_ticket_gift_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ticket_gift_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_tickets" ADD CONSTRAINT "admission_tickets_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_check_ins" ADD CONSTRAINT "ticket_check_ins_ticket_id_admission_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."admission_tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_email_jobs" ADD CONSTRAINT "ticket_email_jobs_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_email_jobs" ADD CONSTRAINT "ticket_email_jobs_ticket_id_admission_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."admission_tickets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_payment_events" ADD CONSTRAINT "ticket_payment_events_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_refunds" ADD CONSTRAINT "ticket_refunds_order_id_ticket_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_order_ordinal_unique" ON "admission_tickets" USING btree ("order_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_batch_ordinal_unique" ON "admission_tickets" USING btree ("batch_id","ordinal");--> statement-breakpoint
CREATE INDEX "admission_ticket_owner_idx" ON "admission_tickets" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_check_in_request_unique" ON "ticket_check_ins" USING btree ("actor_id","request_key");--> statement-breakpoint
CREATE INDEX "ticket_check_in_ticket_idx" ON "ticket_check_ins" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "ticket_email_job_due_idx" ON "ticket_email_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_order_request_unique" ON "ticket_orders" USING btree ("buyer_id","request_key");--> statement-breakpoint
CREATE INDEX "ticket_order_recovery_idx" ON "ticket_orders" USING btree ("next_reconcile_at");--> statement-breakpoint
CREATE INDEX "ticket_order_buyer_idx" ON "ticket_orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "ticket_payment_event_order_idx" ON "ticket_payment_events" USING btree ("order_id");