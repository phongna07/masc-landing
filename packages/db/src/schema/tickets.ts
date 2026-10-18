import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

export type TicketBenefit = "networkingLunch";
export type OrderSnapshot = { packageName: string; category: "normal" | "vip"; quantity: number; benefits: TicketBenefit[]; currency: "VND"; totalPrice: number; promo?: { code: string; revision: string; originalPrice: number } };
const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const ticketSettings = pgTable("ticket_settings", {
	id: integer("id").primaryKey().default(1),
	isSalesOpened: boolean("is_sales_opened").notNull().default(false),
	vipCapacity: integer("vip_capacity").notNull().default(30),
	updatedAt: time("updated_at").notNull().defaultNow(),
}, t => [check("ticket_settings_singleton", sql`${t.id} = 1`), check("ticket_capacity_nonnegative", sql`${t.vipCapacity} >= 0`)]);

export const ticketPackages = pgTable("ticket_packages", {
	name: text("name", { enum: ["Silver", "Golden", "Platinum", "VIP"] }).primaryKey(),
	category: text("category", { enum: ["normal", "vip"] }).notNull(),
	quantity: integer("quantity").notNull(),
	price: integer("price").notNull(),
	benefits: jsonb("benefits").$type<TicketBenefit[]>().notNull().default([]),
}, t => [check("ticket_package_positive_price", sql`${t.price} > 0`), check("ticket_package_shape", sql`(${t.name} = 'Silver' and ${t.quantity} = 1 and ${t.category} = 'normal') or (${t.name} = 'Golden' and ${t.quantity} = 2 and ${t.category} = 'normal') or (${t.name} = 'Platinum' and ${t.quantity} = 3 and ${t.category} = 'normal') or (${t.name} = 'VIP' and ${t.quantity} = 1 and ${t.category} = 'vip')`)]);

export const ticketPromos = pgTable("ticket_promos", {
	id: text("id").primaryKey(),
	code: text("code").notNull().unique(),
	enabled: boolean("enabled").notNull().default(true),
	revision: text("revision").notNull(),
	prices: jsonb("prices").$type<Record<"Silver" | "Golden" | "Platinum" | "VIP", number>>().notNull(),
	totalLimit: integer("total_limit"),
	perBuyerLimit: integer("per_buyer_limit"),
	createdAt: time("created_at").notNull().defaultNow(),
	updatedAt: time("updated_at").notNull().defaultNow(),
}, t => [
	check("ticket_promo_code_format", sql`${t.code} ~ '^[A-Z0-9_-]{1,64}$'`),
	check("ticket_promo_limits", sql`(${t.totalLimit} is null or ${t.totalLimit} > 0) and (${t.perBuyerLimit} is null or ${t.perBuyerLimit} > 0)`),
	check("ticket_promo_prices", sql`jsonb_typeof(${t.prices}) = 'object' and ${t.prices} ?& array['Silver', 'Golden', 'Platinum', 'VIP'] and jsonb_typeof(${t.prices}->'Silver') = 'number' and ((${t.prices}->>'Silver')::numeric = 0 or (${t.prices}->>'Silver')::numeric between 1000 and 1000000000) and (${t.prices}->>'Silver')::numeric = trunc((${t.prices}->>'Silver')::numeric) and jsonb_typeof(${t.prices}->'Golden') = 'number' and ((${t.prices}->>'Golden')::numeric = 0 or (${t.prices}->>'Golden')::numeric between 1000 and 1000000000) and (${t.prices}->>'Golden')::numeric = trunc((${t.prices}->>'Golden')::numeric) and jsonb_typeof(${t.prices}->'Platinum') = 'number' and ((${t.prices}->>'Platinum')::numeric = 0 or (${t.prices}->>'Platinum')::numeric between 1000 and 1000000000) and (${t.prices}->>'Platinum')::numeric = trunc((${t.prices}->>'Platinum')::numeric) and jsonb_typeof(${t.prices}->'VIP') = 'number' and ((${t.prices}->>'VIP')::numeric = 0 or (${t.prices}->>'VIP')::numeric between 1000 and 1000000000) and (${t.prices}->>'VIP')::numeric = trunc((${t.prices}->>'VIP')::numeric)`),
]);

export const ticketOrders = pgTable("ticket_orders", {
	id: text("id").primaryKey(),
	buyerId: text("buyer_id").notNull().references(() => user.id, { onDelete: "restrict" }),
	requestKey: text("request_key").notNull(),
	providerOrderCode: bigint("provider_order_code", { mode: "number" }).notNull().unique(),
	paymentLinkId: text("payment_link_id").unique(),
	checkoutUrl: text("checkout_url"),
	snapshot: jsonb("snapshot").$type<OrderSnapshot>().notNull(),
	promoId: text("promo_id").references(() => ticketPromos.id, { onDelete: "restrict" }),
	promoReservation: text("promo_reservation", { enum: ["none", "held", "consumed", "released"] }).notNull().default("none"),
	referralCode: text("referral_code"),
	buyerEmail: text("buyer_email").notNull(),
	buyerName: text("buyer_name").notNull(),
	buyerPhone: text("buyer_phone").notNull(),
	locale: text("locale", { enum: ["en", "vi"] }).notNull(),
	paymentStatus: text("payment_status", { enum: ["creating", "pending", "processing", "paid", "cancelled", "expired", "failed", "review"] }).notNull().default("creating"),
	fulfillmentStatus: text("fulfillment_status", { enum: ["pending", "issued", "review"] }).notNull().default("pending"),
	reservation: text("reservation", { enum: ["none", "held", "consumed", "released"] }).notNull().default("none"),
	settledAmount: integer("settled_amount").notNull().default(0),
	issue: text("issue"),
	expiresAt: time("expires_at").notNull(),
	paidAt: time("paid_at"),
	createdAt: time("created_at").notNull().defaultNow(),
	updatedAt: time("updated_at").notNull().defaultNow(),
	createAttemptedAt: time("create_attempted_at"),
	reconcileAttempts: integer("reconcile_attempts").notNull().default(0),
	nextReconcileAt: time("next_reconcile_at").notNull().defaultNow(),
	reconcileLeaseUntil: time("reconcile_lease_until"),
	reconcileLeaseId: text("reconcile_lease_id"),
	reconcileRequestId: text("reconcile_request_id"),
	lastVerifiedAt: time("last_verified_at"),
	providerStatus: text("provider_status"),
	checkoutClosedAt: time("checkout_closed_at"),
	resolutionNote: text("resolution_note"),
	resolvedAt: time("resolved_at"),
	resolvedBy: text("resolved_by"),
}, t => [uniqueIndex("ticket_order_request_unique").on(t.buyerId, t.requestKey), uniqueIndex("ticket_order_buyer_pair_unique").on(t.id, t.buyerId), index("ticket_order_recovery_idx").on(t.nextReconcileAt), index("ticket_order_buyer_idx").on(t.buyerId), index("ticket_order_referral_idx").on(t.referralCode), check("ticket_order_referral_format", sql`${t.referralCode} is null or ${t.referralCode} ~ '^[A-Z0-9_-]{1,64}$'`), index("ticket_order_promo_usage_idx").on(t.promoId, t.promoReservation, t.buyerId), check("ticket_order_promo_reservation", sql`(${t.promoId} is null and ${t.promoReservation} = 'none') or (${t.promoId} is not null and ${t.promoReservation} in ('held', 'consumed', 'released') and ${t.snapshot}->'promo' is not null)`), check("ticket_order_buyer_name_required", sql`${t.buyerName} ~ '[^[:space:]]'`), check("ticket_order_buyer_phone_required", sql`${t.buyerPhone} ~ '[^[:space:]]'`), check("ticket_order_amount_nonnegative", sql`${t.settledAmount} >= 0`), check("ticket_order_snapshot_shape", sql`${t.snapshot}->>'currency' = 'VND' and ((${t.snapshot}->>'totalPrice')::integer > 0 or ((${t.snapshot}->>'totalPrice')::integer = 0 and ${t.promoId} is not null)) and ((${t.snapshot}->>'packageName' = 'Silver' and ${t.snapshot}->>'category' = 'normal' and (${t.snapshot}->>'quantity')::integer = 1) or (${t.snapshot}->>'packageName' = 'Golden' and ${t.snapshot}->>'category' = 'normal' and (${t.snapshot}->>'quantity')::integer = 2) or (${t.snapshot}->>'packageName' = 'Platinum' and ${t.snapshot}->>'category' = 'normal' and (${t.snapshot}->>'quantity')::integer = 3) or (${t.snapshot}->>'packageName' = 'VIP' and ${t.snapshot}->>'category' = 'vip' and (${t.snapshot}->>'quantity')::integer = 1))`)]);

export const giftBatches = pgTable("ticket_gift_batches", {
	id: text("id").primaryKey(),
	requestKey: text("request_key").notNull().unique(),
	category: text("category", { enum: ["normal", "vip"] }).notNull(),
	quantity: integer("quantity").notNull(),
	title: text("title").notNull(),
	note: text("note"),
	createdBy: text("created_by").notNull(),
	createdAt: time("created_at").notNull().defaultNow(),
}, t => [check("gift_batch_bounded", sql`${t.quantity} between 1 and 100`)]);

export const admissionTickets = pgTable("admission_tickets", {
	id: text("id").primaryKey(),
	source: text("source", { enum: ["purchased", "gifted"] }).notNull(),
	category: text("category", { enum: ["normal", "vip"] }).notNull(),
	orderId: text("order_id").references(() => ticketOrders.id, { onDelete: "restrict" }),
	batchId: text("batch_id").references(() => giftBatches.id, { onDelete: "restrict" }),
	ownerId: text("owner_id").references(() => user.id, { onDelete: "restrict" }),
	ordinal: integer("ordinal").notNull(),
	code: text("code").notNull().unique(),
	validity: text("validity", { enum: ["valid", "revoked"] }).notNull().default("valid"),
	benefits: jsonb("benefits").$type<TicketBenefit[]>().notNull().default([]),
	recipientName: text("recipient_name"),
	recipientPhone: text("recipient_phone"),
	recipientEmail: text("recipient_email"),
	acceptedCount: integer("accepted_count").notNull().default(0),
	credentialVersion: integer("credential_version").notNull().default(1),
	createdAt: time("created_at").notNull().defaultNow(),
}, t => [uniqueIndex("ticket_order_ordinal_unique").on(t.orderId, t.ordinal), uniqueIndex("ticket_batch_ordinal_unique").on(t.batchId, t.ordinal), index("admission_ticket_owner_idx").on(t.ownerId), foreignKey({ name: "ticket_buyer_ownership_fk", columns: [t.orderId, t.ownerId], foreignColumns: [ticketOrders.id, ticketOrders.buyerId] }).onDelete("restrict"), check("ticket_code_format", sql`${t.code} ~ '^[A-HJ-NP-Z2-9]{20}$'`), check("ticket_validity_values", sql`${t.validity} in ('valid', 'revoked') and ${t.category} in ('normal', 'vip') and ${t.acceptedCount} >= 0 and ${t.credentialVersion} >= 1 and ${t.ordinal} >= 1`), check("ticket_source_ownership", sql`(${t.source} = 'purchased' and ${t.orderId} is not null and ${t.ownerId} is not null and ${t.batchId} is null) or (${t.source} = 'gifted' and ${t.batchId} is not null and ${t.orderId} is null and ${t.ownerId} is null)`)]);

// Tombstones ensure replaced credentials can never be reused; old codes are not stored.
export const ticketCredentials = pgTable("ticket_credentials", {
	codeHash: text("code_hash").primaryKey(),
	ticketId: text("ticket_id").notNull(),
	createdAt: time("created_at").notNull().defaultNow(),
});

export const ticketCheckIns = pgTable("ticket_check_ins", {
	id: text("id").primaryKey(),
	ticketId: text("ticket_id").references(() => admissionTickets.id, { onDelete: "restrict" }),
	actorId: text("actor_id").notNull(),
	requestKey: text("request_key").notNull(),
	outcome: text("outcome", { enum: ["accepted", "rejected"] }).notNull(),
	reason: text("reason").notNull(),
	isOverride: boolean("is_override").notNull().default(false),
	createdAt: time("created_at").notNull().defaultNow(),
}, t => [uniqueIndex("ticket_check_in_request_unique").on(t.actorId, t.requestKey), index("ticket_check_in_ticket_idx").on(t.ticketId, t.createdAt)]);

export const ticketPaymentEvents = pgTable("ticket_payment_events", {
	id: text("id").primaryKey(),
	eventKey: text("event_key").notNull().unique(),
	orderId: text("order_id").references(() => ticketOrders.id, { onDelete: "restrict" }),
	providerOrderCode: bigint("provider_order_code", { mode: "number" }),
	paymentLinkId: text("payment_link_id"),
	reference: text("reference"),
	amount: integer("amount"),
	currency: text("currency"),
	kind: text("kind").notNull(),
	outcome: text("outcome").notNull(),
	createdAt: time("created_at").notNull().defaultNow(),
}, t => [index("ticket_payment_event_order_idx").on(t.orderId)]);

export const ticketEmailJobs = pgTable("ticket_email_jobs", {
	id: text("id").primaryKey(),
	dedupeKey: text("dedupe_key").notNull().unique(),
	orderId: text("order_id").references(() => ticketOrders.id, { onDelete: "restrict" }),
	ticketId: text("ticket_id").references(() => admissionTickets.id, { onDelete: "restrict" }),
	toAddress: text("to_address").notNull(),
	locale: text("locale", { enum: ["en", "vi"] }).notNull(),
	status: text("status", { enum: ["pending", "sending", "sent", "failed"] }).notNull().default("pending"),
	attempts: integer("attempts").notNull().default(0),
	nextAttemptAt: time("next_attempt_at").notNull().defaultNow(),
	leaseUntil: time("lease_until"),
	lastError: text("last_error"),
	sentAt: time("sent_at"),
	createdAt: time("created_at").notNull().defaultNow(),
}, t => [index("ticket_email_job_due_idx").on(t.status, t.nextAttemptAt)]);

export const ticketRefunds = pgTable("ticket_refunds", {
	id: text("id").primaryKey(),
	orderId: text("order_id").notNull().references(() => ticketOrders.id, { onDelete: "restrict" }),
	requestKey: text("request_key").notNull().unique(),
	status: text("status", { enum: ["pending", "completed", "failed"] }).notNull(),
	amount: integer("amount").notNull(),
	reason: text("reason").notNull(),
	reference: text("reference"),
	actorId: text("actor_id").notNull(),
	createdAt: time("created_at").notNull().defaultNow(),
}, t => [check("ticket_refund_positive", sql`${t.amount} > 0`)]);

export const ticketAudit = pgTable("ticket_audit", {
	id: text("id").primaryKey(),
	actorId: text("actor_id").notNull(),
	action: text("action").notNull(),
	entityId: text("entity_id"),
	reason: text("reason"),
	metadata: jsonb("metadata").$type<{ promoCode: string; revision: string; prices?: Record<string, number>; totalLimit?: number | null; perBuyerLimit?: number | null; enabled?: boolean }>(),
	outcome: text("outcome").notNull(),
	createdAt: time("created_at").notNull().defaultNow(),
});

export const ticketRateLimits = pgTable("ticket_rate_limits", {
	key: text("key").primaryKey(),
	windowStart: time("window_start").notNull().defaultNow(),
	count: integer("count").notNull().default(1),
});
