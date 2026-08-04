import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@masc-landing/db";
import { adminEmails, admissionSettings, emailQueue, members, roundOneMemberCvs,
  roundOneMembers, roundOneSubmissions, roundOneTeams, roundSubmissions, roundThreeMembers,
  roundThreeSubmissions, roundThreeTeams, roundTwoMembers, roundTwoSubmissions, roundTwoTeams,
  submissionSettings, teams, user, userAnnouncements } from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, getTableName, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  renderTeamRegistrationSuccess,
  teamRegistrationSuccessEvent,
  teamRegistrationSuccessSubject,
} from "../email/team-registration-success";
import {
  renderTeamRegistrationRejected,
  teamRegistrationRejectedEvent,
  teamRegistrationRejectedSubject,
} from "../email/team-registration-rejected";
import { sendMail } from "../email/send-mail";
import { renderTeamRoundPromotion, teamRoundPromotionEvent } from "../email/team-round-promotion";
import { getAdmissionSettings } from "../admission-settings";
import { adminAreaProcedure, router } from "../index";
import { awarenessSources, type AwarenessSource } from "../registration-schema";
import { roundSchema, type RoundId } from "../rounds";
import { attachmentContentDisposition } from "../submission-files";
import { getSubmissionSettings } from "../submission-settings";

const signedUrlExpirySeconds = 300;
const overviewProcedure = adminAreaProcedure("overview");
const usersProcedure = adminAreaProcedure("users");
const teamsProcedure = adminAreaProcedure("teams");
const mailProcedure = adminAreaProcedure("mail");
const roundsProcedure = adminAreaProcedure("rounds");
const roundInput = z.object({ round: roundSchema });
const submissionInput = roundInput.extend({ submissionId: z.string().trim().min(1).max(128) });
const feedbackInput = submissionInput.extend({
  feedback: z.string().trim().min(1).max(5000),
  score: z.number().finite().nonnegative(),
});
const registrationDecisionSchema = z.enum(["approved", "rejected"]);
const mailStatusSchema = z.enum(["pending", "sent", "failed"]);
const mailListStatusSchema = z.enum(["all", "pending", "sent", "failed"]);
const mailSender = `Ban Tổ chức MASC <${env.MAIL_USERNAME}>`;
const promotionPairSchema = z.discriminatedUnion("sourceRound", [
  z.object({ sourceRound: z.literal("0.5"), targetRound: z.enum(["1", "2"]), teamIds: z.array(z.string().min(1).max(128)).min(1).max(100) }),
  z.object({ sourceRound: z.literal("1"), targetRound: z.literal("2"), teamIds: z.array(z.string().min(1).max(128)).min(1).max(100) }),
  z.object({ sourceRound: z.literal("2"), targetRound: z.literal("3"), teamIds: z.array(z.string().min(1).max(128)).min(1).max(100) }),
]);

function registrationTables(round: RoundId) {
  if (round === "0.5") return { team: teams, member: members };
  if (round === "1") return { team: roundOneTeams as unknown as typeof teams, member: roundOneMembers as unknown as typeof members };
  if (round === "2") return { team: roundTwoTeams as unknown as typeof teams, member: roundTwoMembers as unknown as typeof members };
  return { team: roundThreeTeams as unknown as typeof teams, member: roundThreeMembers as unknown as typeof members };
}

function submissionTables(round: RoundId) {
  const registration = registrationTables(round);
  if (round === "0.5") return { ...registration, submission: roundSubmissions };
  if (round === "1") return { ...registration, submission: roundOneSubmissions as unknown as typeof roundSubmissions };
  if (round === "2") return { ...registration, submission: roundTwoSubmissions as unknown as typeof roundSubmissions };
  return { ...registration, submission: roundThreeSubmissions as unknown as typeof roundSubmissions };
}

function captainExpressions(team: typeof teams, member: typeof members) {
  return {
    captainName: sql<string>`(select ${member.fullName} from ${member}
      where ${member.teamId} = ${team.id} and ${member.isCaptain} = true limit 1)`,
    captainEmail: sql<string>`(select ${member.email} from ${member}
      where ${member.teamId} = ${team.id} and ${member.isCaptain} = true limit 1)`,
  };
}

function isUniqueViolation(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

const s3 = new S3Client({ region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
function identifiedSubmission(input: z.infer<typeof submissionInput>) {
  const { submission } = submissionTables(input.round);
  return and(eq(submission.id, input.submissionId), eq(submission.round, input.round), latestSubmission(submission));
}
function latestSubmission(submission: typeof roundSubmissions) {
  const tableName = sql.identifier(getTableName(submission));
  return sql`not exists (
    select 1 from ${tableName} as "newer_submission"
    where "newer_submission"."team_id" = ${submission.teamId}
      and "newer_submission"."round" = ${submission.round}
      and "newer_submission"."attempt_number" > ${submission.attemptNumber}
  )`;
}
async function findSubmissionFile(input: z.infer<typeof submissionInput>) {
  const { submission: table } = submissionTables(input.round);
  const [submission] = await db.select({ objectKey: table.objectKey, filename: table.originalFilename,
    mimeType: table.mimeType }).from(table).where(identifiedSubmission(input)).limit(1);
  if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
  return submission;
}

type PromotionInput = z.infer<typeof promotionPairSchema>;
type ExportAdmissionMethod = "direct" | "cv_screening" | "round_0_5_promotion" | "promotion";
type ExportTeamRow = {
  id: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  captainPhone: string;
  awarenessSource: AwarenessSource | null;
  awarenessSourceDetail: string | null;
  admissionMethod: ExportAdmissionMethod;
  sourceRound: RoundId | null;
  sourceTeamId: string | null;
  sourceTeamName: string | null;
};

async function getExportTeamRows(round: RoundId): Promise<ExportTeamRow[]> {
  if (round === "0.5") {
    const rows = await db.select({ id: teams.id, name: teams.teamName, status: teams.registrationStatus,
      createdAt: teams.createdAt, captainPhone: teams.captainPhone, awarenessSource: teams.awarenessSource,
      awarenessSourceDetail: teams.awarenessSourceDetail }).from(teams)
      .orderBy(desc(teams.createdAt), asc(teams.teamName));
    return rows.map((row) => ({ ...row, admissionMethod: "direct", sourceRound: null,
      sourceTeamId: null, sourceTeamName: null }));
  }

  if (round === "1") {
    const rows = await db.select({ id: roundOneTeams.id, name: roundOneTeams.teamName,
      status: roundOneTeams.registrationStatus, createdAt: roundOneTeams.createdAt,
      captainPhone: roundOneTeams.captainPhone, awarenessSource: roundOneTeams.awarenessSource,
      awarenessSourceDetail: roundOneTeams.awarenessSourceDetail, admissionMethod: roundOneTeams.admissionMethod,
      sourceTeamId: roundOneTeams.sourceRoundHalfTeamId, sourceTeamName: teams.teamName })
      .from(roundOneTeams).leftJoin(teams, eq(roundOneTeams.sourceRoundHalfTeamId, teams.id))
      .orderBy(desc(roundOneTeams.createdAt), asc(roundOneTeams.teamName));
    return rows.map((row) => ({ ...row, sourceRound: row.sourceTeamId ? "0.5" : null }));
  }

  if (round === "2") {
    const rows = await db.select({ id: roundTwoTeams.id, name: roundTwoTeams.teamName,
      status: roundTwoTeams.registrationStatus, createdAt: roundTwoTeams.createdAt,
      captainPhone: roundTwoTeams.captainPhone, awarenessSource: roundTwoTeams.awarenessSource,
      awarenessSourceDetail: roundTwoTeams.awarenessSourceDetail,
      sourceRoundHalfTeamId: roundTwoTeams.sourceRoundHalfTeamId,
      sourceRoundOneTeamId: roundTwoTeams.sourceRoundOneTeamId,
      sourceRoundHalfTeamName: teams.teamName, sourceRoundOneTeamName: roundOneTeams.teamName })
      .from(roundTwoTeams)
      .leftJoin(teams, eq(roundTwoTeams.sourceRoundHalfTeamId, teams.id))
      .leftJoin(roundOneTeams, eq(roundTwoTeams.sourceRoundOneTeamId, roundOneTeams.id))
      .orderBy(desc(roundTwoTeams.createdAt), asc(roundTwoTeams.teamName));
    return rows.map(({ sourceRoundHalfTeamId, sourceRoundOneTeamId, sourceRoundHalfTeamName,
      sourceRoundOneTeamName, ...row }) => ({
      ...row,
      admissionMethod: "promotion",
      sourceRound: sourceRoundOneTeamId ? "1" : sourceRoundHalfTeamId ? "0.5" : null,
      sourceTeamId: sourceRoundOneTeamId ?? sourceRoundHalfTeamId,
      sourceTeamName: sourceRoundOneTeamName ?? sourceRoundHalfTeamName,
    }));
  }

  const rows = await db.select({ id: roundThreeTeams.id, name: roundThreeTeams.teamName,
    status: roundThreeTeams.registrationStatus, createdAt: roundThreeTeams.createdAt,
    captainPhone: roundThreeTeams.captainPhone, awarenessSource: roundThreeTeams.awarenessSource,
    awarenessSourceDetail: roundThreeTeams.awarenessSourceDetail,
    sourceTeamId: roundThreeTeams.sourceRoundTwoTeamId, sourceTeamName: roundTwoTeams.teamName })
    .from(roundThreeTeams).leftJoin(roundTwoTeams, eq(roundThreeTeams.sourceRoundTwoTeamId, roundTwoTeams.id))
    .orderBy(desc(roundThreeTeams.createdAt), asc(roundThreeTeams.teamName));
  return rows.map((row) => ({ ...row, admissionMethod: "promotion", sourceRound: "2" }));
}

async function promoteOne(input: PromotionInput, sourceTeamId: string) {
  const source = registrationTables(input.sourceRound);
  const target = registrationTables(input.targetRound);
  const [sourceTeam] = await db.select({ id: source.team.id, name: source.team.teamName,
    status: source.team.registrationStatus, captainId: source.team.captainId,
    captainPhone: source.team.captainPhone, awarenessSource: source.team.awarenessSource,
    awarenessSourceDetail: source.team.awarenessSourceDetail }).from(source.team)
    .where(eq(source.team.id, sourceTeamId)).limit(1);
  if (!sourceTeam) return { sourceTeamId, success: false as const, reason: "NOT_FOUND" as const, conflictingEmails: [] as string[] };
  if (sourceTeam.status !== "approved") return { sourceTeamId, success: false as const,
    reason: "SOURCE_NOT_APPROVED" as const, conflictingEmails: [] as string[] };
  const roster = await db.select({ id: source.member.id, fullName: source.member.fullName,
    email: source.member.email, birthdate: source.member.birthdate, universityName: source.member.universityName,
    isCaptain: source.member.isCaptain }).from(source.member).where(eq(source.member.teamId, sourceTeamId))
    .orderBy(desc(source.member.isCaptain), asc(source.member.fullName));
  const captain = roster.find((member) => member.isCaptain);
  if (!captain || roster.length !== 3) return { sourceTeamId, success: false as const,
    reason: "INVALID_ROSTER" as const, conflictingEmails: [] as string[] };
  const normalizedEmails = roster.map((member) => member.email.trim().toLowerCase());
  const conflicts = await db.select({ email: target.member.email }).from(target.member)
    .where(inArray(sql<string>`lower(${target.member.email})`, normalizedEmails));
  if (conflicts.length) return { sourceTeamId, success: false as const, reason: "MEMBER_CONFLICT" as const,
    conflictingEmails: conflicts.map((item) => item.email) };

  const recipients = await db.select({ id: user.id }).from(user).where(or(
    eq(user.id, sourceTeam.captainId),
    inArray(sql<string>`lower(btrim(${user.email}))`, normalizedEmails),
  ));

  const targetTeamId = crypto.randomUUID();
  const targetRoster = roster.map((member) => ({ id: crypto.randomUUID(), teamId: targetTeamId,
    fullName: member.fullName, email: member.email, birthdate: member.birthdate,
    universityName: member.universityName, isCaptain: member.isCaptain }));
  const targetCaptain = targetRoster.find((member) => member.isCaptain)!;
  const promotionMail = renderTeamRoundPromotion(sourceTeam.name, input.sourceRound, input.targetRound);
  const queue = db.insert(emailQueue).values({ fromAddress: mailSender, toAddress: captain.email,
    cc: roster.filter((member) => !member.isCaptain).map((member) => member.email), subject: promotionMail.subject,
    text: promotionMail.text, html: promotionMail.html, eventType: teamRoundPromotionEvent, round: input.targetRound,
    teamId: targetTeamId, memberId: targetCaptain.id, teamName: sourceTeam.name, memberName: captain.fullName,
    approvalSequence: 0 });
  const promotionSourceKey = `team-promotion:${input.sourceRound}:${sourceTeam.id}:${input.targetRound}`;
  const notification = db.insert(userAnnouncements).values(recipients.map((recipient) => ({
    userId: recipient.id,
    type: "team_promoted" as const,
    promotedRound: Number(input.targetRound),
    teamName: sourceTeam.name,
    sourceKey: promotionSourceKey,
  }))).onConflictDoNothing({ target: [userAnnouncements.userId, userAnnouncements.sourceKey] });

  try {
    if (input.targetRound === "1") {
      await db.batch([
        db.insert(roundOneTeams).values({ id: targetTeamId, teamName: sourceTeam.name,
          registrationStatus: "approved", captainId: sourceTeam.captainId, captainPhone: sourceTeam.captainPhone,
          awarenessSource: sourceTeam.awarenessSource, awarenessSourceDetail: sourceTeam.awarenessSourceDetail,
          admissionMethod: "round_0_5_promotion", sourceRoundHalfTeamId: sourceTeam.id }),
        db.insert(roundOneMembers).values(targetRoster), queue, notification,
      ]);
    } else if (input.targetRound === "2") {
      await db.batch([
        db.insert(roundTwoTeams).values({ id: targetTeamId, teamName: sourceTeam.name,
          registrationStatus: "approved", captainId: sourceTeam.captainId, captainPhone: sourceTeam.captainPhone,
          awarenessSource: sourceTeam.awarenessSource, awarenessSourceDetail: sourceTeam.awarenessSourceDetail,
          sourceRoundHalfTeamId: input.sourceRound === "0.5" ? sourceTeam.id : null,
          sourceRoundOneTeamId: input.sourceRound === "1" ? sourceTeam.id : null }),
        db.insert(roundTwoMembers).values(targetRoster), queue, notification,
      ]);
    } else {
      await db.batch([
        db.insert(roundThreeTeams).values({ id: targetTeamId, teamName: sourceTeam.name,
          registrationStatus: "approved", captainId: sourceTeam.captainId, captainPhone: sourceTeam.captainPhone,
          awarenessSource: sourceTeam.awarenessSource, awarenessSourceDetail: sourceTeam.awarenessSourceDetail,
          sourceRoundTwoTeamId: sourceTeam.id }),
        db.insert(roundThreeMembers).values(targetRoster), queue, notification,
      ]);
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      const latestConflicts = await db.select({ email: target.member.email }).from(target.member)
        .where(inArray(sql<string>`lower(${target.member.email})`, normalizedEmails));
      return { sourceTeamId, success: false as const, reason: "MEMBER_CONFLICT" as const,
        conflictingEmails: latestConflicts.map((item) => item.email) };
    }
    throw error;
  }
  return { sourceTeamId, targetTeamId, success: true as const };
}
export const adminRouter = router({
  getSubmissionSettings: overviewProcedure.query(getSubmissionSettings),
  setRoundSubmissionOpen: overviewProcedure.input(roundInput.extend({ isOpen: z.boolean() })).mutation(async ({ input }) => {
    await db.insert(submissionSettings).values({ round: input.round, isOpen: input.isOpen, updatedAt: new Date() })
      .onConflictDoUpdate({ target: submissionSettings.round, set: { isOpen: input.isOpen, updatedAt: new Date() } });
    return getSubmissionSettings();
  }),
  getAdmissionSettings: overviewProcedure.query(getAdmissionSettings),
  setRoundAdmissionOpen: overviewProcedure.input(roundInput.extend({ isOpen: z.boolean() })).mutation(async ({ input }) => {
    if (input.round !== "0.5" && input.round !== "1") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "DIRECT_ADMISSION_NOT_SUPPORTED" });
    }
    await db.insert(admissionSettings).values({ round: input.round, isOpen: input.isOpen, updatedAt: new Date() })
      .onConflictDoUpdate({ target: admissionSettings.round, set: { isOpen: input.isOpen, updatedAt: new Date() } });
    return getAdmissionSettings();
  }),
  listUsers: usersProcedure.query(async () => {
    const users = await db.select({ id: user.id, name: user.name, email: user.email,
      emailVerified: user.emailVerified, image: user.image, adminRole: adminEmails.role,
      createdAt: user.createdAt, updatedAt: user.updatedAt }).from(user)
      .leftJoin(adminEmails, eq(adminEmails.email, sql`lower(btrim(${user.email}))`))
      .orderBy(desc(user.createdAt));
    return users.map(({ adminRole, ...listedUser }) => ({
      ...listedUser,
      role: adminRole ?? ("user" as const),
    }));
  }),
  getUserStats: usersProcedure.query(async () => {
    const [stats] = await db.select({ totalUsers: count() }).from(user);
    return { totalUsers: Number(stats?.totalUsers ?? 0) };
  }),
  listTeams: teamsProcedure.input(roundInput).query(async ({ input }) => {
    const { team, member } = registrationTables(input.round);
    const { captainName, captainEmail } = captainExpressions(team, member);
    return db.select({ id: team.id, name: team.teamName, status: team.registrationStatus,
      createdAt: team.createdAt, captainName, captainEmail, captainPhone: team.captainPhone,
      awarenessSource: team.awarenessSource, awarenessSourceDetail: team.awarenessSourceDetail,
      memberCount: count(member.id) }).from(team).leftJoin(member, eq(team.id, member.teamId))
      .groupBy(team.id).orderBy(desc(team.createdAt), asc(team.teamName));
  }),
  exportTeams: teamsProcedure.input(roundInput).query(async ({ input }) => {
    const teamRows = await getExportTeamRows(input.round);
    if (!teamRows.length) return [];
    const { member } = registrationTables(input.round);
    const memberRows = await db.select({ id: member.id, teamId: member.teamId, fullName: member.fullName,
      email: member.email, birthdate: member.birthdate, universityName: member.universityName,
      isCaptain: member.isCaptain }).from(member)
      .where(inArray(member.teamId, teamRows.map((team) => team.id)))
      .orderBy(asc(member.teamId), desc(member.isCaptain), asc(member.fullName));
    const membersByTeam = new Map<string, Omit<(typeof memberRows)[number], "teamId">[]>();
    for (const { teamId, ...listedMember } of memberRows) {
      const roster = membersByTeam.get(teamId) ?? [];
      roster.push(listedMember);
      membersByTeam.set(teamId, roster);
    }
    return teamRows.map((team) => ({ ...team, members: membersByTeam.get(team.id) ?? [] }));
  }),
  getTeamStats: teamsProcedure.input(roundInput).query(async ({ input }) => {
    const { team, member } = registrationTables(input.round);
    const [teamStatsRows, participantStatsRows, awarenessStatsRows] = await Promise.all([
      db.select({
        totalTeams: count(),
        pendingTeams: sql<number>`count(*) filter (where ${team.registrationStatus} = ${"pending"})`,
        approvedTeams: sql<number>`count(*) filter (where ${team.registrationStatus} = ${"approved"})`,
        rejectedTeams: sql<number>`count(*) filter (where ${team.registrationStatus} = ${"rejected"})`,
      }).from(team),
      db.select({ totalParticipants: count() }).from(member),
      db.select({ awarenessSource: team.awarenessSource, total: count() }).from(team)
        .where(isNotNull(team.awarenessSource)).groupBy(team.awarenessSource),
    ]);
    const [teamStats] = teamStatsRows;
    const [participantStats] = participantStatsRows;
    const awarenessSourceCounts = awarenessStatsRows.length === 0 ? null : Object.fromEntries(
      awarenessSources.map((source) => [source,
        Number(awarenessStatsRows.find((row) => row.awarenessSource === source)?.total ?? 0)]),
    ) as Record<AwarenessSource, number>;
    return {
      totalTeams: Number(teamStats?.totalTeams ?? 0),
      totalParticipants: Number(participantStats?.totalParticipants ?? 0),
      pendingTeams: Number(teamStats?.pendingTeams ?? 0),
      approvedTeams: Number(teamStats?.approvedTeams ?? 0),
      rejectedTeams: Number(teamStats?.rejectedTeams ?? 0),
      awarenessSourceCounts,
    };
  }),
  getTeam: teamsProcedure.input(roundInput.extend({ teamId: z.string().trim().min(1).max(128) })).query(async ({ input }) => {
    const { team: teamTable, member } = registrationTables(input.round);
    const { captainName, captainEmail } = captainExpressions(teamTable, member);
    const [team] = await db.select({ id: teamTable.id, name: teamTable.teamName, status: teamTable.registrationStatus,
      createdAt: teamTable.createdAt, captainName, captainEmail, captainPhone: teamTable.captainPhone,
      awarenessSource: teamTable.awarenessSource, awarenessSourceDetail: teamTable.awarenessSourceDetail })
      .from(teamTable).where(eq(teamTable.id, input.teamId)).limit(1);
    if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
    const roster = await db.select({ id: member.id, fullName: member.fullName, email: member.email,
      birthdate: member.birthdate, universityName: member.universityName, isCaptain: member.isCaptain }).from(member)
      .where(eq(member.teamId, team.id)).orderBy(desc(member.isCaptain), asc(member.fullName));
    let admissionMethod: "direct" | "cv_screening" | "round_0_5_promotion" | "promotion" = input.round === "0.5" ? "direct" : "promotion";
    if (input.round === "1") {
      const [source] = await db.select({ admissionMethod: roundOneTeams.admissionMethod }).from(roundOneTeams)
        .where(eq(roundOneTeams.id, input.teamId)).limit(1);
      admissionMethod = source?.admissionMethod ?? "promotion";
    }
    const cvs = input.round === "1" ? await db.select({ memberId: roundOneMemberCvs.memberId,
      filename: roundOneMemberCvs.originalFilename, fileSize: roundOneMemberCvs.fileSize })
      .from(roundOneMemberCvs).innerJoin(roundOneMembers, eq(roundOneMemberCvs.memberId, roundOneMembers.id))
      .where(eq(roundOneMembers.teamId, input.teamId)) : [];
    return { ...team, round: input.round, admissionMethod, members: roster.map((item) => ({ ...item,
      cv: cvs.find((cv) => cv.memberId === item.id) ?? null })) };
  }),
  updateTeamStatus: teamsProcedure.input(roundInput.extend({
    teamId: z.string().trim().min(1).max(128), status: registrationDecisionSchema,
  })).mutation(async ({ input }) => {
    const { team, member } = registrationTables(input.round);
    const [existing] = await db.select({ id: team.id, name: team.teamName, status: team.registrationStatus,
      approvalSequence: team.approvalSequence }).from(team).where(eq(team.id, input.teamId)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
    if (existing.status === input.status) {
      throw new TRPCError({ code: "CONFLICT", message: "Team already has this registration status" });
    }

    const roster = await db.select({ id: member.id, fullName: member.fullName, email: member.email,
      universityName: member.universityName, isCaptain: member.isCaptain }).from(member).where(eq(member.teamId, existing.id))
      .orderBy(desc(member.isCaptain), asc(member.fullName));
    const captain = roster.find((member) => member.isCaptain);
    if (!captain) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Team captain not found" });

    const isApproval = input.status === "approved";
    const content = isApproval
      ? renderTeamRegistrationSuccess(existing.name, roster)
      : renderTeamRegistrationRejected(existing.name);
    const eventType = isApproval ? teamRegistrationSuccessEvent : teamRegistrationRejectedEvent;
    const oppositeEventType = isApproval ? teamRegistrationRejectedEvent : teamRegistrationSuccessEvent;
    const subject = `${isApproval ? teamRegistrationSuccessSubject : teamRegistrationRejectedSubject} — Vòng ${input.round}`;
    const nextSequence = existing.approvalSequence + 1;
    const cc = isApproval ? roster.filter((member) => !member.isCaptain).map((member) => member.email) : [];
    const queueRecord = { id: crypto.randomUUID(), from_address: mailSender, to_address: captain.email, cc,
      subject, text: content.text, html: content.html, event_type: eventType, team_id: existing.id,
      member_id: captain.id, approval_sequence: nextSequence, round: input.round,
      team_name: existing.name, member_name: captain.fullName };
    const transition = await db.execute(sql`
      with transitioned as (
        update ${team}
        set "registration_status" = ${input.status}, "approval_sequence" = ${nextSequence}
        where ${team.id} = ${existing.id}
          and ${team.registrationStatus} = ${existing.status}
          and ${team.approvalSequence} = ${existing.approvalSequence}
          and ${team.registrationStatus} <> ${input.status}
        returning ${team.id}, ${team.registrationStatus}
      ), removed as (
        delete from ${emailQueue}
        where ${emailQueue.teamId} = ${existing.id}
          and ${emailQueue.round} = ${input.round}
          and ${emailQueue.eventType} = ${oppositeEventType}
          and ${emailQueue.status} in ('pending', 'failed')
          and exists (select 1 from transitioned)
        returning ${emailQueue.id}
      ), queued as (
        insert into ${emailQueue} (id, from_address, to_address, cc, subject, text, html, status, event_type,
          round, team_id, member_id, team_name, member_name, approval_sequence, attempt_count, created_at, updated_at)
        select item.id, item.from_address, item.to_address, item.cc, item.subject, item.text, item.html, 'pending',
          item.event_type, item.round::competition_round, item.team_id, item.member_id, item.team_name, item.member_name,
          item.approval_sequence, 0, now(), now()
        from transitioned
        cross join jsonb_to_record(${JSON.stringify(queueRecord)}::jsonb) as item(
          id text, from_address text, to_address text, cc text[], subject text, text text, html text, event_type text,
          team_id text, member_id text, approval_sequence integer, round text, team_name text, member_name text
        )
        cross join (select count(*) from removed) as removal
        returning id
      )
      select transitioned.id, transitioned.registration_status as status,
        (select count(*)::integer from queued) as queued_mail_count,
        (select count(*)::integer from removed) as removed_mail_count
      from transitioned
    `);
    const result = transition.rows[0] as {
      id: string;
      status: "approved" | "rejected";
      queued_mail_count: number;
      removed_mail_count: number;
    } | undefined;
    if (!result) throw new TRPCError({ code: "CONFLICT", message: "Team status changed while updating" });
    return { id: result.id, status: result.status, queuedMailCount: Number(result.queued_mail_count),
      removedMailCount: Number(result.removed_mail_count) };
  }),
  promoteTeams: teamsProcedure.input(promotionPairSchema).mutation(async ({ input }) => {
    if (new Set(input.teamIds).size !== input.teamIds.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "DUPLICATE_TEAM_IDS" });
    }
    const results = [];
    for (const teamId of input.teamIds) results.push(await promoteOne(input, teamId));
    return { results };
  }),
  createTeamCvUrl: teamsProcedure.input(z.object({ teamId: z.string().min(1).max(128),
    memberId: z.string().min(1).max(128), disposition: z.enum(["inline", "attachment"]).default("inline") }))
    .mutation(async ({ input }) => {
      const [cv] = await db.select({ objectKey: roundOneMemberCvs.objectKey,
        filename: roundOneMemberCvs.originalFilename }).from(roundOneMemberCvs)
        .innerJoin(roundOneMembers, eq(roundOneMemberCvs.memberId, roundOneMembers.id))
        .where(and(eq(roundOneMembers.teamId, input.teamId), eq(roundOneMemberCvs.memberId, input.memberId))).limit(1);
      if (!cv) throw new TRPCError({ code: "NOT_FOUND", message: "CV_NOT_FOUND" });
      const safeFilename = cv.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
      return { url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: cv.objectKey,
        ResponseContentType: "application/pdf",
        ResponseContentDisposition: `${input.disposition}; filename="${safeFilename}"` }), { expiresIn: signedUrlExpirySeconds }) };
    }),
  listMail: mailProcedure.input(z.object({ status: mailListStatusSchema.default("pending") })).query(async ({ input }) => {
    const where = input.status === "all" ? undefined : eq(emailQueue.status, input.status);
    return db.select({ id: emailQueue.id, toAddress: emailQueue.toAddress, cc: emailQueue.cc, subject: emailQueue.subject,
      status: emailQueue.status, attemptCount: emailQueue.attemptCount, errorMessage: emailQueue.errorMessage,
      createdAt: emailQueue.createdAt, lastAttemptedAt: emailQueue.lastAttemptedAt, sentAt: emailQueue.sentAt,
      round: emailQueue.round, teamId: emailQueue.teamId, teamName: emailQueue.teamName,
      memberName: emailQueue.memberName }).from(emailQueue).where(where)
      .orderBy(sql`case ${emailQueue.status} when 'pending' then 0 when 'failed' then 1 else 2 end`, desc(emailQueue.createdAt));
  }),
  getMailStats: mailProcedure.query(async () => {
    const [stats] = await db.select({
      totalMails: count(),
      pendingMails: sql<number>`count(*) filter (where ${emailQueue.status} = ${"pending"})`,
      sentMails: sql<number>`count(*) filter (where ${emailQueue.status} = ${"sent"})`,
      failedMails: sql<number>`count(*) filter (where ${emailQueue.status} = ${"failed"})`,
    }).from(emailQueue);
    return {
      totalMails: Number(stats?.totalMails ?? 0),
      pendingMails: Number(stats?.pendingMails ?? 0),
      sentMails: Number(stats?.sentMails ?? 0),
      failedMails: Number(stats?.failedMails ?? 0),
    };
  }),
  getMail: mailProcedure.input(z.object({ mailId: z.string().trim().min(1).max(128) })).query(async ({ input }) => {
    const [mail] = await db.select({ id: emailQueue.id, fromAddress: emailQueue.fromAddress,
      toAddress: emailQueue.toAddress, cc: emailQueue.cc, subject: emailQueue.subject, text: emailQueue.text, html: emailQueue.html,
      status: emailQueue.status, eventType: emailQueue.eventType, approvalSequence: emailQueue.approvalSequence,
      attemptCount: emailQueue.attemptCount, errorMessage: emailQueue.errorMessage, createdAt: emailQueue.createdAt,
      lastAttemptedAt: emailQueue.lastAttemptedAt, sentAt: emailQueue.sentAt, round: emailQueue.round,
      teamId: emailQueue.teamId, teamName: emailQueue.teamName, memberName: emailQueue.memberName }).from(emailQueue)
      .where(eq(emailQueue.id, input.mailId)).limit(1);
    if (!mail) throw new TRPCError({ code: "NOT_FOUND", message: "Mail not found" });
    return mail;
  }),
  sendMail: mailProcedure.input(z.object({ mailId: z.string().trim().min(1).max(128) })).mutation(async ({ input }) => {
    const [mail] = await db.select().from(emailQueue).where(eq(emailQueue.id, input.mailId)).limit(1);
    if (!mail) throw new TRPCError({ code: "NOT_FOUND", message: "Mail not found" });
    if (!mailStatusSchema.exclude(["sent"]).safeParse(mail.status).success) {
      throw new TRPCError({ code: "CONFLICT", message: "Mail has already been sent" });
    }

    const attemptedAt = new Date();
    try {
      await sendMail({ id: mail.id, from: mail.fromAddress, to: mail.toAddress, cc: mail.cc, subject: mail.subject,
        text: mail.text, html: mail.html });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2000) : "Unknown mail provider error";
      await db.update(emailQueue).set({ status: "failed", lastAttemptedAt: attemptedAt, errorMessage: message,
        updatedAt: new Date(), attemptCount: sql`${emailQueue.attemptCount} + 1` })
        .where(eq(emailQueue.id, mail.id));
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EMAIL_SEND_FAILED" });
    }
    const [sent] = await db.update(emailQueue).set({ status: "sent", sentAt: new Date(),
      lastAttemptedAt: attemptedAt, errorMessage: null, updatedAt: new Date(),
      attemptCount: sql`${emailQueue.attemptCount} + 1` }).where(eq(emailQueue.id, mail.id))
      .returning({ id: emailQueue.id, status: emailQueue.status });
    return sent!;
  }),
  listRoundSubmissions: roundsProcedure.input(roundInput).query(async ({ input }) => {
    const { team, member, submission } = submissionTables(input.round);
    const { captainName, captainEmail } = captainExpressions(team, member);
    return db.select({ id: submission.id, teamId: team.id, teamName: team.teamName,
      teamStatus: team.registrationStatus, captainName, captainEmail,
      originalFilename: submission.originalFilename, mimeType: submission.mimeType,
      fileSize: submission.fileSize, createdAt: submission.createdAt, updatedAt: submission.updatedAt })
      .from(submission).innerJoin(team, eq(submission.teamId, team.id))
      .where(and(eq(submission.round, input.round), latestSubmission(submission)))
      .orderBy(desc(submission.updatedAt), asc(team.teamName));
  }),
  getRoundSubmission: roundsProcedure.input(submissionInput).query(async ({ input }) => {
    const { team, member, submission: submissionTable } = submissionTables(input.round);
    const { captainName, captainEmail } = captainExpressions(team, member);
    const [submission] = await db.select({ id: submissionTable.id, description: submissionTable.description,
      feedback: submissionTable.feedback, score: submissionTable.score,
      feedbackPublished: submissionTable.feedbackPublished,
      originalFilename: submissionTable.originalFilename, mimeType: submissionTable.mimeType,
      fileSize: submissionTable.fileSize, createdAt: submissionTable.createdAt, updatedAt: submissionTable.updatedAt,
      teamId: team.id, teamName: team.teamName, teamStatus: team.registrationStatus, teamCreatedAt: team.createdAt,
      captainName, captainEmail, captainPhone: team.captainPhone,
    }).from(submissionTable).innerJoin(team, eq(submissionTable.teamId, team.id))
      .where(identifiedSubmission(input)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    const roster = await db.select({ id: member.id, fullName: member.fullName, email: member.email,
      birthdate: member.birthdate, universityName: member.universityName, isCaptain: member.isCaptain }).from(member)
      .where(eq(member.teamId, submission.teamId)).orderBy(desc(member.isCaptain), asc(member.fullName));
    return { ...submission, members: roster };
  }),
  saveRoundFeedbackDraft: roundsProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const { submission: table } = submissionTables(input.round);
    const [submission] = await db.update(table)
      .set({ feedback: input.feedback, score: input.score, feedbackPublished: false })
      .where(identifiedSubmission(input)).returning({ id: table.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" }); return { success: true };
  }),
  publishRoundFeedback: roundsProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const { submission: table } = submissionTables(input.round);
    const [submission] = await db.update(table)
      .set({ feedback: input.feedback, score: input.score, feedbackPublished: true })
      .where(identifiedSubmission(input)).returning({ id: table.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" }); return { success: true };
  }),
  createRoundDownloadUrl: roundsProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findSubmissionFile(input);
    return { downloadUrl: await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentDisposition: attachmentContentDisposition(submission.filename) }), { expiresIn: signedUrlExpirySeconds }) };
  }),
  createRoundPreviewUrl: roundsProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findSubmissionFile(input);
    if (submission.mimeType !== "application/pdf") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "UNSUPPORTED_PREVIEW" });
    }
    const sourceUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentType: "application/pdf", ResponseContentDisposition: "inline" }), { expiresIn: signedUrlExpirySeconds });
    return { previewUrl: sourceUrl };
  }),
});
