import { protectedProcedure, publicProcedure, router } from "../index";
import { announcementsRouter } from "./announcements";
import { adminRouter } from "./admin";
import { registrationRouter } from "./registration";
import { roundOneRouter } from "./round-one";
import { roundThreeRouter } from "./round-three";
import { roundTwoRouter } from "./round-two";

export const appRouter = router({
  announcements: announcementsRouter,
  admin: adminRouter,
  registration: registrationRouter,
  roundOne: roundOneRouter,
  roundTwo: roundTwoRouter,
  roundThree: roundThreeRouter,
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
