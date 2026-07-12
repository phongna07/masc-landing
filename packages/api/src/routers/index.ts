import { protectedProcedure, publicProcedure, router } from "../index";
import { adminRouter } from "./admin";
import { registrationRouter } from "./registration";

export const appRouter = router({
  admin: adminRouter,
  registration: registrationRouter,
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
});
export type AppRouter = typeof appRouter;
