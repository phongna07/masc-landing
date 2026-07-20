import { initTRPC, TRPCError } from "@trpc/server";

import { getAdminByEmail } from "./admin-access";
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

export const adminProcedure = freshProtectedProcedure.use(async ({ ctx, next }) => {
  const admin = await getAdminByEmail(ctx.session.user.email);
  if (!admin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Administrator access required",
    });
  }

  return next({ ctx: { ...ctx, admin } });
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
