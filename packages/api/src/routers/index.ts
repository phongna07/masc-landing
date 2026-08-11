import { protectedProcedure, publicProcedure, router } from "../index";
import { getUploadLimits } from "../upload-limits";
import { announcementsRouter } from "./announcements";
import { adminRouter } from "./admin";
import { registrationRouter } from "./registration";
import { roundSubmissionRouter } from "./round-submission";
import { userAnnouncementsRouter } from "./user-announcements";

export const appRouter = router({
  announcements: announcementsRouter,
  admin: adminRouter,
  registration: registrationRouter,
  roundSubmission: roundSubmissionRouter,
  userAnnouncements: userAnnouncementsRouter,
  uploadLimits: protectedProcedure.query(getUploadLimits),
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
