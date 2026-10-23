import { db } from "@masc-landing/db";
import { adminEmails } from "@masc-landing/db/schema/admin-emails";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { adminAreaProcedure, router } from "../index";

const manageAdminsProcedure = adminAreaProcedure("manageAdmins");
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
// Developer access is provisioned only through manual database changes.
const adminInput = z.object({
	email: emailSchema,
	role: z.enum(["root", "professional", "entrance-staff", "sales-collaborator"]),
});
const targetInput = z.object({ originalEmail: emailSchema });

function duplicateEmailError(): never {
	throw new TRPCError({ code: "CONFLICT", message: "emailExists" });
}

function rethrowUpdateError(error: unknown): never {
	let cause = error;
	for (let depth = 0; depth < 5 && cause && typeof cause === "object"; depth++) {
		if ("code" in cause && cause.code === "23505") duplicateEmailError();
		cause = "cause" in cause ? cause.cause : null;
	}
	throw error;
}

export const adminManagementRouter = router({
	list: manageAdminsProcedure.query(() => db.select().from(adminEmails).orderBy(asc(adminEmails.email))),
	create: manageAdminsProcedure.input(adminInput).mutation(async ({ input }) => {
		const [created] = await db.insert(adminEmails).values(input).onConflictDoNothing().returning();
		if (!created) duplicateEmailError();
		return created;
	}),
	update: manageAdminsProcedure.input(targetInput.extend(adminInput.shape)).mutation(async ({ input }) => {
		const [updated] = await db.update(adminEmails)
			.set({ email: input.email, role: input.role })
			// Keep the protection in the write itself, including concurrent role changes.
			.where(and(eq(adminEmails.email, input.originalEmail), ne(adminEmails.role, "developer")))
			.returning().catch(rethrowUpdateError);
		if (!updated) throw new TRPCError({ code: "CONFLICT", message: "recordProtectedOrMissing" });
		return updated;
	}),
	delete: manageAdminsProcedure.input(targetInput).mutation(async ({ input }) => {
		const [deleted] = await db.delete(adminEmails)
			.where(and(eq(adminEmails.email, input.originalEmail), ne(adminEmails.role, "developer")))
			.returning();
		if (!deleted) throw new TRPCError({ code: "CONFLICT", message: "recordProtectedOrMissing" });
		return deleted;
	}),
});
