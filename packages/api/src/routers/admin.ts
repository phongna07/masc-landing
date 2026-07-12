import { auth } from "@masc-landing/auth";
import { db } from "@masc-landing/db";
import { members, teams, user } from "@masc-landing/db/schema/index";
import { TRPCError } from "@trpc/server";
import { asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, router } from "../index";

const userBatchSize = 100;

export const adminRouter = router({
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const allUsers = [];
    let offset = 0;
    let total = 0;

    do {
      const result = await auth.api.listUsers({
        headers: ctx.headers,
        query: {
          limit: userBatchSize,
          offset,
          sortBy: "createdAt",
          sortDirection: "desc",
        },
      });

      allUsers.push(...result.users);
      total = result.total;
      offset += result.users.length;
    } while (offset < total && offset > 0);

    return allUsers.map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      emailVerified: item.emailVerified,
      image: item.image,
      role: item.role,
      banned: item.banned,
      banReason: item.banReason,
      banExpires: item.banExpires,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  }),

  listTeams: adminProcedure.query(async () => {
    return db
      .select({
        id: teams.id,
        name: teams.teamName,
        status: teams.registrationStatus,
        createdAt: teams.createdAt,
        captainName: user.name,
        captainEmail: user.email,
        captainPhone: teams.captainPhone,
        memberCount: count(members.id),
      })
      .from(teams)
      .innerJoin(user, eq(teams.captainId, user.id))
      .leftJoin(members, eq(teams.id, members.teamId))
      .groupBy(teams.id, user.id)
      .orderBy(desc(teams.createdAt), asc(teams.teamName));
  }),

  getTeam: adminProcedure
    .input(z.object({ teamId: z.string().trim().min(1).max(128) }))
    .query(async ({ input }) => {
      const [team] = await db
        .select({
          id: teams.id,
          name: teams.teamName,
          status: teams.registrationStatus,
          createdAt: teams.createdAt,
          captainName: user.name,
          captainEmail: user.email,
          captainPhone: teams.captainPhone,
        })
        .from(teams)
        .innerJoin(user, eq(teams.captainId, user.id))
        .where(eq(teams.id, input.teamId))
        .limit(1);

      if (!team) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      }

      const roster = await db
        .select({
          id: members.id,
          fullName: members.fullName,
          email: members.email,
          universityName: members.universityName,
          isCaptain: members.isCaptain,
        })
        .from(members)
        .where(eq(members.teamId, team.id))
        .orderBy(desc(members.isCaptain), asc(members.fullName));

      return { ...team, members: roster };
    }),
});
