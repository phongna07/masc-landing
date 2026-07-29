import { db } from "@masc-landing/db";
import { userAnnouncements } from "@masc-landing/db/schema/index";
import { desc, eq } from "drizzle-orm";

import { protectedProcedure, router } from "../index";

export async function getUserAnnouncements(userId: string) {
  const rows = await db.select({
    id: userAnnouncements.id,
    type: userAnnouncements.type,
    round: userAnnouncements.promotedRound,
    teamName: userAnnouncements.teamName,
    createdAt: userAnnouncements.createdAt,
  }).from(userAnnouncements)
    .where(eq(userAnnouncements.userId, userId))
    .orderBy(desc(userAnnouncements.createdAt));
  return rows.map((announcement) => ({
    ...announcement,
    createdAt: announcement.createdAt.toISOString(),
  }));
}

export const userAnnouncementsRouter = router({
  listMine: protectedProcedure.query(({ ctx }) => getUserAnnouncements(ctx.session.user.id)),
});
