ALTER TYPE "public"."admin_role" ADD VALUE 'sales-collaborator';--> statement-breakpoint
CREATE TABLE "ticket_sales_log_email_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"sales_log_id" text NOT NULL,
	"request_key" text NOT NULL,
	"actor_id" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_sales_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"request_key" text NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_email" text NOT NULL,
	"buyer_phone" text NOT NULL,
	"category" text NOT NULL,
	"quantity" integer NOT NULL,
	"amount_received" integer NOT NULL,
	"proof_upload_id" text,
	"proof_object_key" text,
	"proof_filename" text,
	"created_by" text NOT NULL,
	"creator_name" text NOT NULL,
	"creator_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_status" text DEFAULT 'pending' NOT NULL,
	"email_lease_until" timestamp with time zone,
	"email_attempt_id" text,
	"email_sent_at" timestamp with time zone,
	CONSTRAINT "sales_log_values" CHECK ("ticket_sales_logs"."quantity" between 1 and 100 and "ticket_sales_logs"."amount_received" between 1 and 2000000000 and "ticket_sales_logs"."category" in ('normal', 'vip') and "ticket_sales_logs"."email_status" in ('pending', 'sending', 'sent', 'failed') and "ticket_sales_logs"."buyer_name" ~ '[^[:space:]]' and "ticket_sales_logs"."buyer_phone" ~ '[^[:space:]]'),
	CONSTRAINT "sales_log_proof_shape" CHECK (("ticket_sales_logs"."proof_upload_id" is null and "ticket_sales_logs"."proof_object_key" is null and "ticket_sales_logs"."proof_filename" is null) or ("ticket_sales_logs"."proof_upload_id" is not null and "ticket_sales_logs"."proof_object_key" is not null and "ticket_sales_logs"."proof_filename" is not null))
);
--> statement-breakpoint
ALTER TABLE "admission_tickets" DROP CONSTRAINT "ticket_source_ownership";--> statement-breakpoint
ALTER TABLE "admission_tickets" ADD COLUMN "sales_log_id" text;--> statement-breakpoint
ALTER TABLE "ticket_sales_log_email_attempts" ADD CONSTRAINT "ticket_sales_log_email_attempts_sales_log_id_ticket_sales_logs_id_fk" FOREIGN KEY ("sales_log_id") REFERENCES "public"."ticket_sales_logs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_email_request_unique" ON "ticket_sales_log_email_attempts" USING btree ("sales_log_id","request_key");--> statement-breakpoint
CREATE INDEX "sales_email_log_idx" ON "ticket_sales_log_email_attempts" USING btree ("sales_log_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_log_creator_request_unique" ON "ticket_sales_logs" USING btree ("created_by","request_key");--> statement-breakpoint
CREATE INDEX "sales_log_created_idx" ON "ticket_sales_logs" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "sales_log_creator_idx" ON "ticket_sales_logs" USING btree ("created_by","created_at");--> statement-breakpoint
ALTER TABLE "admission_tickets" ADD CONSTRAINT "admission_tickets_sales_log_id_ticket_sales_logs_id_fk" FOREIGN KEY ("sales_log_id") REFERENCES "public"."ticket_sales_logs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_sales_log_ordinal_unique" ON "admission_tickets" USING btree ("sales_log_id","ordinal");--> statement-breakpoint
ALTER TABLE "admission_tickets" ADD CONSTRAINT "ticket_source_ownership" CHECK (("admission_tickets"."source" = 'purchased' and "admission_tickets"."order_id" is not null and "admission_tickets"."owner_id" is not null and "admission_tickets"."batch_id" is null and "admission_tickets"."sales_log_id" is null) or ("admission_tickets"."source" = 'gifted' and "admission_tickets"."batch_id" is not null and "admission_tickets"."order_id" is null and "admission_tickets"."owner_id" is null and "admission_tickets"."sales_log_id" is null) or ("admission_tickets"."source" = 'sales-log' and "admission_tickets"."sales_log_id" is not null and "admission_tickets"."order_id" is null and "admission_tickets"."owner_id" is null and "admission_tickets"."batch_id" is null));