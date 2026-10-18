import { db } from "@masc-landing/db";
import { user } from "@masc-landing/db/schema/auth";
import { admissionTickets, giftBatches, ticketCheckIns, ticketOrders } from "@masc-landing/db/schema/tickets";
import { and, asc, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

export const checkInLogsInput = z.object({
	page: z.number().int().min(0).max(100000).default(0),
	pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]).default(25),
	search: z.string().trim().max(100).default(""),
	staff: z.string().trim().max(100).default(""),
	source: z.enum(["", "purchased", "gifted", "unknown"]).default(""),
	category: z.enum(["", "normal", "vip"]).default(""),
	outcome: z.enum(["", "accepted", "rejected"]).default(""),
	admissionType: z.enum(["", "standard", "override"]).default(""),
	from: z.union([z.iso.date(), z.literal("")]).default(""),
	to: z.union([z.iso.date(), z.literal("")]).default(""),
	sort: z.enum(["createdAt", "recipient", "actor", "source", "category", "outcome"]).default("createdAt"),
	direction: z.enum(["asc", "desc"]).default("desc"),
}).refine(input => !input.from || !input.to || input.from <= input.to, { message: "invalidDateRange", path: ["to"] });

const recipientName = sql<string | null>`coalesce(${admissionTickets.recipientName}, ${ticketOrders.buyerName})`;
const recipientEmail = sql<string | null>`coalesce(${admissionTickets.recipientEmail}, ${ticketOrders.buyerEmail})`;
const recipientPhone = sql<string | null>`coalesce(${admissionTickets.recipientPhone}, ${ticketOrders.buyerPhone})`;
// Escape LIKE metacharacters so names, email addresses and identifiers are searched literally.
const searchPattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const dayStart = (date: string) => new Date(`${date}T00:00:00+07:00`);

export async function listCheckInLogs(input: z.infer<typeof checkInLogsInput>) {
	const filter = and(
		input.search ? or(
			ilike(ticketCheckIns.ticketId, searchPattern(input.search)),
			ilike(recipientName, searchPattern(input.search)),
			ilike(recipientEmail, searchPattern(input.search)),
			ilike(recipientPhone, searchPattern(input.search)),
			ilike(giftBatches.title, searchPattern(input.search)),
			ilike(ticketOrders.id, searchPattern(input.search)),
			ilike(sql`${ticketOrders.providerOrderCode}::text`, searchPattern(input.search)),
		) : undefined,
		input.staff ? or(ilike(user.name, searchPattern(input.staff)), ilike(user.email, searchPattern(input.staff)), ilike(ticketCheckIns.actorId, searchPattern(input.staff))) : undefined,
		input.source === "unknown" ? sql`${admissionTickets.id} is null` : input.source ? eq(admissionTickets.source, input.source) : undefined,
		input.category ? eq(admissionTickets.category, input.category) : undefined,
		input.outcome ? eq(ticketCheckIns.outcome, input.outcome) : undefined,
		input.admissionType ? eq(ticketCheckIns.isOverride, input.admissionType === "override") : undefined,
		input.from ? gte(ticketCheckIns.createdAt, dayStart(input.from)) : undefined,
		// The end date includes the entire day in Vietnam, matching the displayed timestamps.
		input.to ? lt(ticketCheckIns.createdAt, new Date(dayStart(input.to).getTime() + 86400000)) : undefined,
	);
	const sortColumns = {
		createdAt: ticketCheckIns.createdAt,
		recipient: recipientName,
		actor: sql`coalesce(${user.name}, ${ticketCheckIns.actorId})`,
		source: admissionTickets.source,
		category: admissionTickets.category,
		outcome: ticketCheckIns.outcome,
	};
	const sortDirection = input.direction === "asc" ? asc : desc;
	const [items, totals] = await Promise.all([
		db.select({
			id: ticketCheckIns.id, ticketId: ticketCheckIns.ticketId, createdAt: ticketCheckIns.createdAt,
			outcome: ticketCheckIns.outcome, reason: ticketCheckIns.reason, isOverride: ticketCheckIns.isOverride,
			actorId: ticketCheckIns.actorId, actorName: user.name, actorEmail: user.email,
			source: admissionTickets.source, category: admissionTickets.category, ordinal: admissionTickets.ordinal,
			orderId: ticketOrders.id, orderCode: ticketOrders.providerOrderCode, batchId: giftBatches.id, batchTitle: giftBatches.title,
			recipientName, recipientEmail, recipientPhone,
		}).from(ticketCheckIns)
			.leftJoin(admissionTickets, eq(ticketCheckIns.ticketId, admissionTickets.id))
			.leftJoin(ticketOrders, eq(admissionTickets.orderId, ticketOrders.id))
			.leftJoin(giftBatches, eq(admissionTickets.batchId, giftBatches.id))
			.leftJoin(user, eq(ticketCheckIns.actorId, user.id))
			.where(filter).orderBy(sql`${sortDirection(sortColumns[input.sort])} nulls last`, desc(ticketCheckIns.createdAt), ticketCheckIns.id)
			.limit(input.pageSize).offset(input.page * input.pageSize),
		db.select({ total: sql<number>`count(*)::int` }).from(ticketCheckIns)
			.leftJoin(admissionTickets, eq(ticketCheckIns.ticketId, admissionTickets.id))
			.leftJoin(ticketOrders, eq(admissionTickets.orderId, ticketOrders.id))
			.leftJoin(giftBatches, eq(admissionTickets.batchId, giftBatches.id))
			.leftJoin(user, eq(ticketCheckIns.actorId, user.id)).where(filter),
	]);
	return { items, total: totals[0]?.total ?? 0, pageSize: input.pageSize };
}
