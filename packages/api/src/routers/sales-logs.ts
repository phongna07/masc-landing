import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminAreaProcedure, router } from "../index";
import { canAccessAdminArea } from "../admin-roles";
import { getTicketConfig, rateLimit, ticketError } from "../tickets/core";
import { accessibleSalesLog, createSalesLog, createSalesLogInput, listSalesLogs, salesLogDetail, salesLogPageInput, type SalesActor } from "../tickets/sales-logs";
import { createProofUpload, proofFileInput, proofPreviewUrl } from "../tickets/sales-log-files";
import { sendSalesLogEmail } from "../tickets/sales-log-email";

const sales = adminAreaProcedure("salesLog");
const idInput = z.object({ id: z.uuid() });
const safe = async <T>(work: () => Promise<T>): Promise<T> => {
	try { return await work(); } catch (error) {
		if (error instanceof TRPCError) throw error;
		throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "operationFailed" });
	}
};
const scoped = sales.use(({ ctx, next }) => next({ ctx: { ...ctx, salesActor: { ...ctx.session.user, isRoot: canAccessAdminArea(ctx.admin.role, "tickets") } satisfies SalesActor } }));
export const salesLogsRouter = router({
	config: scoped.query(() => safe(async () => {
		const config = await getTicketConfig();
		return { vipAvailable: config.vipAvailable };
	})),
	createUploadUrl: scoped.input(proofFileInput).mutation(({ ctx, input }) => safe(async () => {
		await rateLimit(ctx.salesActor.id, "sales-proof-upload", 20);
		return createProofUpload(ctx.salesActor.id, input);
	})),
	create: scoped.input(createSalesLogInput).mutation(({ ctx, input }) => safe(async () => {
		await rateLimit(ctx.salesActor.id, "sales-log-create", 20);
		const log = await createSalesLog(input, ctx.salesActor);
		return sendSalesLogEmail(log.id, ctx.salesActor, "initial", true);
	})),
	list: scoped.input(salesLogPageInput).query(({ ctx, input }) => safe(() => listSalesLogs(input, ctx.salesActor))),
	detail: scoped.input(idInput).query(({ ctx, input }) => safe(() => salesLogDetail(input.id, ctx.salesActor))),
	proof: scoped.input(idInput).mutation(({ ctx, input }) => safe(async () => {
		const log = await accessibleSalesLog(input.id, ctx.salesActor);
		if (!log.proofObjectKey) ticketError("notFound", "NOT_FOUND");
		return { url: await proofPreviewUrl(log.proofObjectKey) };
	})),
	sendEmail: scoped.input(idInput.extend({ requestKey: z.uuid() })).mutation(({ ctx, input }) => safe(async () => {
		await rateLimit(ctx.salesActor.id, "sales-log-email", 6);
		return sendSalesLogEmail(input.id, ctx.salesActor, input.requestKey);
	})),
});
