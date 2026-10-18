import { db } from "@masc-landing/db";
import { ticketEmailJobs, ticketOrders } from "@masc-landing/db/schema/tickets";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

export const emailJobsInput = z.object({
	page: z.number().int().min(0).max(100000).default(0),
	status: z.enum(["all", "pending", "sending", "sent", "failed"]).default("all"),
});

export async function listTicketEmailJobs(input: z.infer<typeof emailJobsInput>) {
	const pageSize = 25;
	const [items, totals] = await Promise.all([
		db.select({
			id: ticketEmailJobs.id, toAddress: ticketEmailJobs.toAddress, status: ticketEmailJobs.status,
			orderId: ticketEmailJobs.orderId, orderCode: ticketOrders.providerOrderCode, ticketId: ticketEmailJobs.ticketId,
			attempts: ticketEmailJobs.attempts, nextAttemptAt: ticketEmailJobs.nextAttemptAt,
			sentAt: ticketEmailJobs.sentAt, createdAt: ticketEmailJobs.createdAt,
		}).from(ticketEmailJobs)
			.leftJoin(ticketOrders, eq(ticketEmailJobs.orderId, ticketOrders.id))
			.where(input.status === "all" ? undefined : eq(ticketEmailJobs.status, input.status))
			.orderBy(desc(ticketEmailJobs.createdAt), ticketEmailJobs.id)
			.limit(pageSize).offset(input.page * pageSize),
		db.select({
			all: sql<number>`count(*)::int`,
			pending: sql<number>`count(*) filter (where ${ticketEmailJobs.status} = 'pending')::int`,
			sending: sql<number>`count(*) filter (where ${ticketEmailJobs.status} = 'sending')::int`,
			sent: sql<number>`count(*) filter (where ${ticketEmailJobs.status} = 'sent')::int`,
			failed: sql<number>`count(*) filter (where ${ticketEmailJobs.status} = 'failed')::int`,
		}).from(ticketEmailJobs),
	]);
	const counts = totals[0]!;
	return { items, counts, total: counts[input.status], pageSize };
}
