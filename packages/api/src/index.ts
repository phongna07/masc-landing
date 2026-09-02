import { initTRPC, TRPCError } from "@trpc/server";
import { db } from "@masc-landing/db";
import { adminActivityLogs } from "@masc-landing/db/schema/admin-activity-logs";

import { getAdminByEmail } from "./admin-access";
import { sanitizeAdminActivityInput } from "./admin-activity-input";
import { canAccessAdminArea, type AdminArea } from "./admin-roles";
import type { Context } from "./context";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const session = await ctx.getSession();
  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session,
    },
  });
});

export const freshProtectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const session = await ctx.getFreshSession();
  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      cause: "No session",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session,
    },
  });
});

export const adminProcedure = freshProtectedProcedure.use(async ({ ctx, next, path, type, getRawInput }) => {
  const admin = await getAdminByEmail(ctx.session.user.email);
  if (!admin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Administrator access required",
    });
  }

  if (type !== "mutation") {
    return next({ ctx: { ...ctx, admin } });
  }

  let rawInput: unknown;
  try {
    rawInput = await getRawInput();
  } catch {
    rawInput = undefined;
  }

  const writeActivity = async (outcome: "success" | "failure", errorCode: string | null) => {
    try {
      await db.insert(adminActivityLogs).values({
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name,
        actorEmail: ctx.session.user.email,
        actorRole: admin.role,
        procedurePath: path,
        procedureType: type,
        input: sanitizeAdminActivityInput(rawInput),
        outcome,
        errorCode,
      });
    } catch (error) {
      console.error("Failed to persist admin activity log", { path, type, outcome, error });
    }
  };

  try {
    const result = await next({ ctx: { ...ctx, admin } });
    await writeActivity(result.ok ? "success" : "failure", result.ok ? null : result.error.code);
    return result;
  } catch (error) {
    await writeActivity("failure", error instanceof TRPCError ? error.code : "INTERNAL_SERVER_ERROR");
    throw error;
  }
});

export function adminAreaProcedure(area: AdminArea) {
  return adminProcedure.use(({ ctx, next }) => {
    if (!canAccessAdminArea(ctx.admin.role, area)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Administrator role does not have access to this area",
      });
    }

    return next({ ctx });
  });
}
