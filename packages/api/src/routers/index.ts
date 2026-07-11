import { protectedProcedure, publicProcedure, router } from "../index";
import { registrationRouter } from "./registration";

export const appRouter = router({
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
