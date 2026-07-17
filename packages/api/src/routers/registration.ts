import { db } from "@masc-landing/db";
import { members, teams } from "@masc-landing/db/schema/index";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";

import { protectedProcedure, router } from "../index";
import { createTeamInputSchema } from "../registration-schema";

export { createTeamInputSchema } from "../registration-schema";

function isUniqueViolation(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

export const registrationRouter = router({
  current: protectedProcedure.query(async ({ ctx }) => {
    const email = ctx.session.user.email.trim().toLowerCase();
    const [membership] = await db
      .select({
        isCaptain: members.isCaptain,
        teamId: teams.id,
        teamName: teams.teamName,
        registrationStatus: teams.registrationStatus,
        captainPhone: teams.captainPhone,
      })
      .from(members)
      .innerJoin(teams, eq(members.teamId, teams.id))
      .where(or(
        and(eq(teams.captainId, ctx.session.user.id), eq(members.isCaptain, true)),
        sql`lower(${members.email}) = ${email}`,
      ))
      .limit(1);

    if (!membership) {
      return { registered: false as const };
    }

    const roster = await db
      .select({
        id: members.id,
        fullName: members.fullName,
        email: members.email,
        birthdate: members.birthdate,
        universityName: members.universityName,
        isCaptain: members.isCaptain,
      })
      .from(members)
      .where(eq(members.teamId, membership.teamId))
      .orderBy(sql`${members.isCaptain} desc`, members.fullName);

    return {
      registered: true as const,
      role: membership.isCaptain ? ("captain" as const) : ("member" as const),
      team: {
        id: membership.teamId,
        name: membership.teamName,
        status: membership.registrationStatus,
        captainPhone: membership.captainPhone,
        members: roster,
      },
    };
  }),

  createTeam: protectedProcedure.input(createTeamInputSchema).mutation(async ({ ctx, input }) => {
    const captainEmail = ctx.session.user.email.trim().toLowerCase();
    const allEmails = [captainEmail, ...input.teammates.map((member) => member.email)];

    if (new Set(allEmails).size !== allEmails.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "DUPLICATE_EMAILS" });
    }

    const existingMembers = await db
      .select({ email: members.email })
      .from(members)
      .where(inArray(sql<string>`lower(${members.email})`, allEmails))
      .limit(1);

    if (existingMembers.length > 0) {
      throw new TRPCError({ code: "CONFLICT", message: "EMAIL_ALREADY_REGISTERED" });
    }

    const teamId = crypto.randomUUID();
    const roster = [
      {
        id: crypto.randomUUID(),
        teamId,
        isCaptain: true,
        fullName: input.captainFullName,
        email: captainEmail,
        birthdate: input.captainBirthdate,
        universityName: input.captainUniversityName,
      },
      ...input.teammates.map((member) => ({
        id: crypto.randomUUID(),
        teamId,
        isCaptain: false,
        ...member,
      })),
    ];

    try {
      await db.batch([
        db.insert(teams).values({
          id: teamId,
          teamName: input.teamName,
          captainId: ctx.session.user.id,
          captainPhone: input.captainPhone,
        }),
        db.insert(members).values(roster),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TRPCError({ code: "CONFLICT", message: "EMAIL_ALREADY_REGISTERED" });
      }
      throw error;
    }

    return { teamId };
  }),
});
