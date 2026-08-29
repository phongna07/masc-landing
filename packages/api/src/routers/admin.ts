import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@masc-landing/db";
import {
  adminEmails, admissionSettings, dashboardTabSettings, mailCampaigns, members, preferencesSettings, roundOneMemberCvs,
  pdfExportJobs, roundOneMembers, roundOneSubmissions, roundOneTeams, roundSubmissions, roundThreeMembers,
  roundThreeSubmissions, roundThreeTeams, roundTwoMembers, roundTwoSubmissions, roundTwoTeams,
  submissionSettings, teams, uploadLimitSettings, user, userAnnouncements
} from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, getTableName, gt, inArray, isNotNull, max, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { getAdmissionSettings } from "../admission-settings";
import { getDashboardTabSettings } from "../dashboard-tab-settings";
import { adminAreaProcedure, router } from "../index";
import { awarenessSources, type AwarenessSource } from "../registration-schema";
import { roundSchema, type RoundId } from "../rounds";
import { attachmentContentDisposition, roundSubmissionArchiveFilename } from "../submission-files";
import {
  campaignRowToInput,
  findMailCampaign,
  listMailCampaigns,
  listMailCampaignTeams,
  mailCampaignInputSchema,
  previewMailCampaign,
  sendMailCampaignTeam,
} from "../mail-campaigns";
import { getSubmissionSettings } from "../submission-settings";
import {
  getAdminRoundOnePreferenceSettings,
  getRoundOnePreferenceSettings,
  resolveRoundOnePreferences,
} from "../round-one-preferences";
import {
  getUploadLimits,
  MEBIBYTE,
  uploadLimitDatabaseKinds,
  uploadLimitKinds,
} from "../upload-limits";

const signedUrlExpirySeconds = 300;
const overviewProcedure = adminAreaProcedure("overview");
const usersProcedure = adminAreaProcedure("users");
const teamsProcedure = adminAreaProcedure("teams");
const mailProcedure = adminAreaProcedure("mail");
const roundsProcedure = adminAreaProcedure("rounds");
const roundOneCvScreeningProcedure = adminAreaProcedure("roundOneCvScreening");
const roundInput = z.object({ round: roundSchema });
const teamEliminationInput = roundInput.extend({
  teamIds: z.array(z.string().trim().min(1).max(128)).min(1).max(500),
  isEliminated: z.boolean(),
});
const submissionInput = roundInput.extend({ submissionId: z.string().trim().min(1).max(128) });
const pdfExportInput = roundInput.extend({ exportId: z.string().trim().min(1).max(128) });
const feedbackInput = submissionInput.extend({
  feedback: z.string().trim().min(1).max(5000),
  score: z.number().finite().nonnegative().optional(),
});
const registrationDecisionSchema = z.enum(["approved", "rejected"]);
const preferenceNameSchema = z.string().trim().min(1).max(160);
const promotionPairSchema = z.discriminatedUnion("sourceRound", [
  z.object({ sourceRound: z.literal("0.5"), targetRound: z.enum(["1", "2"]), teamIds: z.array(z.string().min(1).max(128)).min(1).max(500) }),
  z.object({ sourceRound: z.literal("1"), targetRound: z.literal("2"), teamIds: z.array(z.string().min(1).max(128)).min(1).max(500) }),
  z.object({ sourceRound: z.literal("2"), targetRound: z.literal("3"), teamIds: z.array(z.string().min(1).max(128)).min(1).max(500) }),
]);

function registrationTables(round: RoundId) {
  if (round === "0.5") return { team: teams, member: members };
  if (round === "1") return { team: roundOneTeams as unknown as typeof teams, member: roundOneMembers as unknown as typeof members };
  if (round === "2") return { team: roundTwoTeams as unknown as typeof teams, member: roundTwoMembers as unknown as typeof members };
  return { team: roundThreeTeams as unknown as typeof teams, member: roundThreeMembers as unknown as typeof members };
}

function roundOneCvScreeningQueue() {
  return or(
    eq(roundOneTeams.admissionMethod, "cv_screening"),
    and(eq(roundOneTeams.admissionMethod, "round_0_5_promotion"),
      ne(roundOneTeams.preferenceStatus, "not_submitted")),
  );
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

const s3 = new S3Client({
  region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }
});
const pdfExporterHealthUrl = env.PDF_EXPORTER_URL
  ? new URL("/health", env.PDF_EXPORTER_URL).toString()
  : null;
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
  const [submission] = await db.select({
    objectKey: table.objectKey, filename: table.originalFilename,
    mimeType: table.mimeType
  }).from(table).where(identifiedSubmission(input)).limit(1);
  if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
  return submission;
}

type PromotionInput = z.infer<typeof promotionPairSchema>;
type ExportAdmissionMethod = "direct" | "cv_screening" | "round_0_5_promotion" | "promotion";
type ExportTeamRow = {
  id: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  isEliminated: boolean;
  createdAt: Date;
  captainPhone: string;
  awarenessSource: AwarenessSource | null;
  awarenessSourceDetail: string | null;
  admissionMethod: ExportAdmissionMethod;
  sourceRound: RoundId | null;
  sourceTeamId: string | null;
  sourceTeamName: string | null;
  preferenceStatus: "not_submitted" | "submitted" | "assigned" | null;
  preferences: { id: string; name: string }[];
  assignedTrack: { id: string; name: string } | null;
};

async function getExportTeamRows(round: RoundId): Promise<ExportTeamRow[]> {
  if (round === "0.5") {
    const rows = await db.select({
      id: teams.id, name: teams.teamName, status: teams.registrationStatus,
      isEliminated: teams.isEliminated,
      createdAt: teams.createdAt, captainPhone: teams.captainPhone, awarenessSource: teams.awarenessSource,
      awarenessSourceDetail: teams.awarenessSourceDetail
    }).from(teams)
      .orderBy(desc(teams.createdAt), asc(teams.teamName));
    return rows.map((row) => ({
      ...row, admissionMethod: "direct", sourceRound: null,
      sourceTeamId: null, sourceTeamName: null, preferenceStatus: null, preferences: [], assignedTrack: null
    }));
  }

  if (round === "1") {
    const rows = await db.select({
      id: roundOneTeams.id, name: roundOneTeams.teamName,
      status: roundOneTeams.registrationStatus, isEliminated: roundOneTeams.isEliminated,
      createdAt: roundOneTeams.createdAt,
      captainPhone: roundOneTeams.captainPhone, awarenessSource: roundOneTeams.awarenessSource,
      awarenessSourceDetail: roundOneTeams.awarenessSourceDetail, admissionMethod: roundOneTeams.admissionMethod,
      preferenceStatus: roundOneTeams.preferenceStatus, preferences: roundOneTeams.preferences,
      assignedTrackId: roundOneTeams.assignedTrackId,
      sourceTeamId: roundOneTeams.sourceRoundHalfTeamId, sourceTeamName: teams.teamName
    })
      .from(roundOneTeams).leftJoin(teams, eq(roundOneTeams.sourceRoundHalfTeamId, teams.id))
      .orderBy(desc(roundOneTeams.createdAt), asc(roundOneTeams.teamName));
    const settings = await getRoundOnePreferenceSettings(false);
    const byId = new Map(settings.map((setting) => [setting.id, { id: setting.id, name: setting.name }]));
    return rows.map(({ assignedTrackId, preferences, ...row }) => ({
      ...row,
      sourceRound: row.sourceTeamId ? "0.5" : null,
      preferences: preferences.flatMap((id) => byId.get(id) ?? []),
      assignedTrack: assignedTrackId ? byId.get(assignedTrackId) ?? null : null,
    }));
  }

  if (round === "2") {
    const rows = await db.select({
      id: roundTwoTeams.id, name: roundTwoTeams.teamName,
      status: roundTwoTeams.registrationStatus, isEliminated: roundTwoTeams.isEliminated,
      createdAt: roundTwoTeams.createdAt,
      captainPhone: roundTwoTeams.captainPhone, awarenessSource: roundTwoTeams.awarenessSource,
      awarenessSourceDetail: roundTwoTeams.awarenessSourceDetail,
      sourceRoundHalfTeamId: roundTwoTeams.sourceRoundHalfTeamId,
      sourceRoundOneTeamId: roundTwoTeams.sourceRoundOneTeamId,
      sourceRoundHalfTeamName: teams.teamName, sourceRoundOneTeamName: roundOneTeams.teamName
    })
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
        preferenceStatus: null,
        preferences: [],
        assignedTrack: null,
      }));
  }

  const rows = await db.select({
    id: roundThreeTeams.id, name: roundThreeTeams.teamName,
    status: roundThreeTeams.registrationStatus, isEliminated: roundThreeTeams.isEliminated,
    createdAt: roundThreeTeams.createdAt,
    captainPhone: roundThreeTeams.captainPhone, awarenessSource: roundThreeTeams.awarenessSource,
    awarenessSourceDetail: roundThreeTeams.awarenessSourceDetail,
    sourceTeamId: roundThreeTeams.sourceRoundTwoTeamId, sourceTeamName: roundTwoTeams.teamName
  })
    .from(roundThreeTeams).leftJoin(roundTwoTeams, eq(roundThreeTeams.sourceRoundTwoTeamId, roundTwoTeams.id))
    .orderBy(desc(roundThreeTeams.createdAt), asc(roundThreeTeams.teamName));
  return rows.map((row) => ({
    ...row, admissionMethod: "promotion", sourceRound: "2",
    preferenceStatus: null, preferences: [], assignedTrack: null
  }));
}

async function promoteOne(input: PromotionInput, sourceTeamId: string) {
  const source = registrationTables(input.sourceRound);
  const target = registrationTables(input.targetRound);
  const [sourceTeam] = await db.select({
    id: source.team.id, name: source.team.teamName,
    status: source.team.registrationStatus, captainId: source.team.captainId,
    isEliminated: source.team.isEliminated,
    captainPhone: source.team.captainPhone, awarenessSource: source.team.awarenessSource,
    awarenessSourceDetail: source.team.awarenessSourceDetail
  }).from(source.team)
    .where(eq(source.team.id, sourceTeamId)).limit(1);
  if (!sourceTeam) return { sourceTeamId, success: false as const, reason: "NOT_FOUND" as const, conflictingEmails: [] as string[] };
  if (sourceTeam.status !== "approved") return {
    sourceTeamId, success: false as const,
    reason: "SOURCE_NOT_APPROVED" as const, conflictingEmails: [] as string[]
  };
  if (sourceTeam.isEliminated) return {
    sourceTeamId, success: false as const,
    reason: "SOURCE_ELIMINATED" as const, conflictingEmails: [] as string[]
  };
  const roster = await db.select({
    id: source.member.id, fullName: source.member.fullName,
    email: source.member.email, birthdate: source.member.birthdate, universityName: source.member.universityName,
    isCaptain: source.member.isCaptain
  }).from(source.member).where(eq(source.member.teamId, sourceTeamId))
    .orderBy(desc(source.member.isCaptain), asc(source.member.fullName));
  const captain = roster.find((member) => member.isCaptain);
  if (!captain || roster.length !== 3) return {
    sourceTeamId, success: false as const,
    reason: "INVALID_ROSTER" as const, conflictingEmails: [] as string[]
  };
  const normalizedEmails = roster.map((member) => member.email.trim().toLowerCase());
  const conflicts = await db.select({ email: target.member.email }).from(target.member)
    .where(inArray(sql<string>`lower(${target.member.email})`, normalizedEmails));
  if (conflicts.length) return {
    sourceTeamId, success: false as const, reason: "MEMBER_CONFLICT" as const,
    conflictingEmails: conflicts.map((item) => item.email)
  };

  const recipients = await db.select({ id: user.id }).from(user).where(or(
    eq(user.id, sourceTeam.captainId),
    inArray(sql<string>`lower(btrim(${user.email}))`, normalizedEmails),
  ));

  const targetTeamId = crypto.randomUUID();
  const targetRoster = roster.map((member) => ({
    id: crypto.randomUUID(), teamId: targetTeamId,
    fullName: member.fullName, email: member.email, birthdate: member.birthdate,
    universityName: member.universityName, isCaptain: member.isCaptain
  }));
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
        db.insert(roundOneTeams).values({
          id: targetTeamId, teamName: sourceTeam.name,
          registrationStatus: "approved", captainId: sourceTeam.captainId, captainPhone: sourceTeam.captainPhone,
          awarenessSource: sourceTeam.awarenessSource, awarenessSourceDetail: sourceTeam.awarenessSourceDetail,
          admissionMethod: "round_0_5_promotion", sourceRoundHalfTeamId: sourceTeam.id
        }),
        db.insert(roundOneMembers).values(targetRoster), notification,
      ]);
    } else if (input.targetRound === "2") {
      await db.batch([
        db.insert(roundTwoTeams).values({
          id: targetTeamId, teamName: sourceTeam.name,
          registrationStatus: "approved", captainId: sourceTeam.captainId, captainPhone: sourceTeam.captainPhone,
          awarenessSource: sourceTeam.awarenessSource, awarenessSourceDetail: sourceTeam.awarenessSourceDetail,
          sourceRoundHalfTeamId: input.sourceRound === "0.5" ? sourceTeam.id : null,
          sourceRoundOneTeamId: input.sourceRound === "1" ? sourceTeam.id : null
        }),
        db.insert(roundTwoMembers).values(targetRoster), notification,
      ]);
    } else {
      await db.batch([
        db.insert(roundThreeTeams).values({
          id: targetTeamId, teamName: sourceTeam.name,
          registrationStatus: "approved", captainId: sourceTeam.captainId, captainPhone: sourceTeam.captainPhone,
          awarenessSource: sourceTeam.awarenessSource, awarenessSourceDetail: sourceTeam.awarenessSourceDetail,
          sourceRoundTwoTeamId: sourceTeam.id
        }),
        db.insert(roundThreeMembers).values(targetRoster), notification,
      ]);
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      const latestConflicts = await db.select({ email: target.member.email }).from(target.member)
        .where(inArray(sql<string>`lower(${target.member.email})`, normalizedEmails));
      return {
        sourceTeamId, success: false as const, reason: "MEMBER_CONFLICT" as const,
        conflictingEmails: latestConflicts.map((item) => item.email)
      };
    }
    throw error;
  }
  return { sourceTeamId, targetTeamId, success: true as const };
}

async function decideRoundOneCvTeam(input: { teamId: string; status: "approved" | "rejected"; trackId?: string }) {
  const [existing] = await db.select({
    id: roundOneTeams.id, name: roundOneTeams.teamName,
    status: roundOneTeams.registrationStatus, preferenceStatus: roundOneTeams.preferenceStatus,
    preferences: roundOneTeams.preferences, admissionMethod: roundOneTeams.admissionMethod
  }).from(roundOneTeams)
    .where(eq(roundOneTeams.id, input.teamId)).limit(1);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
  if (existing.admissionMethod !== "cv_screening" || existing.status !== "pending" || existing.preferenceStatus !== "submitted") {
    throw new TRPCError({ code: "CONFLICT", message: "TEAM_NOT_READY_FOR_SCREENING" });
  }
  const isApproval = input.status === "approved";
  if (isApproval && (!input.trackId || !existing.preferences.includes(input.trackId))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ASSIGNED_TRACK_MUST_BE_SUBMITTED" });
  }
  if (isApproval) {
    const [assignedTrack] = await db.select({ id: preferencesSettings.id }).from(preferencesSettings)
      .where(eq(preferencesSettings.id, input.trackId!)).limit(1);
    if (!assignedTrack) throw new TRPCError({ code: "BAD_REQUEST", message: "TRACK_NOT_FOUND" });
  }

  const [result] = await db.update(roundOneTeams).set({
    registrationStatus: input.status,
    approvalSequence: sql`${roundOneTeams.approvalSequence} + 1`,
    ...(isApproval ? {
      preferenceStatus: "assigned" as const,
      assignedTrackId: input.trackId!,
      assignedAt: new Date(),
    } : {}),
  }).where(and(
    eq(roundOneTeams.id, existing.id),
    eq(roundOneTeams.registrationStatus, "pending"),
    eq(roundOneTeams.preferenceStatus, "submitted"),
  )).returning({
    id: roundOneTeams.id,
    status: roundOneTeams.registrationStatus,
    preferenceStatus: roundOneTeams.preferenceStatus,
  });
  if (!result) throw new TRPCError({ code: "CONFLICT", message: "TEAM_CHANGED_WHILE_SCREENING" });
  return result;
}

async function assignRoundOneTrack(input: { teamId: string; trackId: string }) {
  const [existing] = await db.select({
    status: roundOneTeams.registrationStatus,
    preferenceStatus: roundOneTeams.preferenceStatus, preferences: roundOneTeams.preferences,
    assignedTrackId: roundOneTeams.assignedTrackId
  }).from(roundOneTeams)
    .where(eq(roundOneTeams.id, input.teamId)).limit(1);
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
  if (existing.status !== "approved" || !["submitted", "assigned"].includes(existing.preferenceStatus)) {
    throw new TRPCError({ code: "CONFLICT", message: "TEAM_NOT_READY_FOR_ASSIGNMENT" });
  }
  if (!existing.preferences.includes(input.trackId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ASSIGNED_TRACK_MUST_BE_SUBMITTED" });
  }
  if (existing.preferenceStatus === "assigned" && existing.assignedTrackId === input.trackId) {
    throw new TRPCError({ code: "CONFLICT", message: "TRACK_ALREADY_ASSIGNED" });
  }
  const result = await db.execute(sql`
    update ${roundOneTeams}
    set "preference_status" = 'assigned', "assigned_track_id" = ${input.trackId}, "assigned_at" = now()
    where ${roundOneTeams.id} = ${input.teamId}
      and ${roundOneTeams.registrationStatus} = 'approved'
      and ${roundOneTeams.preferenceStatus} = ${existing.preferenceStatus}
      and ${roundOneTeams.assignedTrackId} is not distinct from ${existing.assignedTrackId}
      and ${input.trackId} = any(${roundOneTeams.preferences})
    returning ${roundOneTeams.id}
  `);
  if (!result.rows[0]) throw new TRPCError({ code: "CONFLICT", message: "TEAM_CHANGED_WHILE_ASSIGNING" });
  return { id: input.teamId, preferenceStatus: "assigned" as const, assignedTrackId: input.trackId };
}
export const adminRouter = router({
  getRoundOnePreferenceSettings: overviewProcedure.query(getAdminRoundOnePreferenceSettings),
  createRoundOnePreferenceSetting: overviewProcedure.input(z.object({ name: preferenceNameSchema }))
    .mutation(async ({ input }) => {
      const [order] = await db.select({ value: max(preferencesSettings.displayOrder) }).from(preferencesSettings);
      try {
        const [created] = await db.insert(preferencesSettings).values({
          name: input.name,
          displayOrder: Number(order?.value ?? 0) + 1,
        }).returning({ id: preferencesSettings.id });
        return { id: created!.id };
      } catch (error) {
        if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "PREFERENCE_NAME_EXISTS" });
        throw error;
      }
    }),
  updateRoundOnePreferenceSetting: overviewProcedure.input(z.object({
    id: z.string().trim().min(1).max(128),
    name: preferenceNameSchema.optional(),
    isActive: z.boolean().optional(),
  }).refine((input) => input.name !== undefined || input.isActive !== undefined))
    .mutation(async ({ input }) => {
      const [existing] = await db.select({ isActive: preferencesSettings.isActive })
        .from(preferencesSettings).where(eq(preferencesSettings.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "PREFERENCE_SETTING_NOT_FOUND" });
      if (existing.isActive && input.isActive === false) {
        const [active] = await db.select({ total: count() }).from(preferencesSettings)
          .where(eq(preferencesSettings.isActive, true));
        if (Number(active?.total ?? 0) <= 3) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AT_LEAST_THREE_ACTIVE_PREFERENCES" });
        }
      }
      try {
        await db.update(preferencesSettings).set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedAt: new Date(),
        }).where(eq(preferencesSettings.id, input.id));
      } catch (error) {
        if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "PREFERENCE_NAME_EXISTS" });
        throw error;
      }
      return { id: input.id };
    }),
  reorderRoundOnePreferenceSettings: overviewProcedure.input(z.object({
    orderedIds: z.array(z.string().trim().min(1).max(128)).min(3).max(500),
  })).mutation(async ({ input }) => {
    if (new Set(input.orderedIds).size !== input.orderedIds.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "DUPLICATE_PREFERENCE_IDS" });
    }
    const current = await db.select({ id: preferencesSettings.id }).from(preferencesSettings);
    if (current.length !== input.orderedIds.length || current.some((setting) => !input.orderedIds.includes(setting.id))) {
      throw new TRPCError({ code: "CONFLICT", message: "PREFERENCE_SETTINGS_CHANGED" });
    }
    for (const [index, id] of input.orderedIds.entries()) {
      await db.update(preferencesSettings).set({ displayOrder: index + 1, updatedAt: new Date() })
        .where(eq(preferencesSettings.id, id));
    }
    return getRoundOnePreferenceSettings(false);
  }),
  getDashboardTabSettings: overviewProcedure.query(getDashboardTabSettings),
  setDashboardTabVisible: overviewProcedure.input(roundInput.extend({ isVisible: z.boolean() })).mutation(async ({ input }) => {
    await db.insert(dashboardTabSettings).values({ round: input.round, isVisible: input.isVisible, updatedAt: new Date() })
      .onConflictDoUpdate({ target: dashboardTabSettings.round, set: { isVisible: input.isVisible, updatedAt: new Date() } });
    return getDashboardTabSettings();
  }),
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
  getUploadLimits: overviewProcedure.query(getUploadLimits),
  setUploadLimit: overviewProcedure.input(z.object({
    kind: z.enum(uploadLimitKinds),
    maxFileSizeMiB: z.number().int().min(1).max(500),
  })).mutation(async ({ input }) => {
    const kind = uploadLimitDatabaseKinds[input.kind];
    await db.insert(uploadLimitSettings).values({
      kind,
      maxFileSize: input.maxFileSizeMiB * MEBIBYTE,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: uploadLimitSettings.kind,
      set: { maxFileSize: input.maxFileSizeMiB * MEBIBYTE, updatedAt: new Date() },
    });
    return getUploadLimits();
  }),
  listUsers: usersProcedure.query(async () => {
    const users = await db.select({
      id: user.id, name: user.name, email: user.email,
      emailVerified: user.emailVerified, image: user.image, adminRole: adminEmails.role,
      createdAt: user.createdAt, updatedAt: user.updatedAt
    }).from(user)
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
    const base = await db.select({
      id: team.id, name: team.teamName, status: team.registrationStatus,
      isEliminated: team.isEliminated, createdAt: team.createdAt, captainName, captainEmail,
      captainPhone: team.captainPhone,
      awarenessSource: team.awarenessSource, awarenessSourceDetail: team.awarenessSourceDetail,
      memberCount: count(member.id)
    }).from(team).leftJoin(member, eq(team.id, member.teamId))
      .groupBy(team.id).orderBy(desc(team.createdAt), asc(team.teamName));
    if (input.round !== "1") return base.map((item) => ({
      ...item, preferenceStatus: null,
      preferences: [] as { id: string; name: string }[], assignedTrack: null as { id: string; name: string } | null
    }));
    const preferenceRows = await db.select({
      id: roundOneTeams.id, status: roundOneTeams.preferenceStatus,
      preferences: roundOneTeams.preferences, assignedTrackId: roundOneTeams.assignedTrackId
    }).from(roundOneTeams);
    const settings = await getRoundOnePreferenceSettings(false);
    const byId = new Map(settings.map((setting) => [setting.id, { id: setting.id, name: setting.name }]));
    const byTeam = new Map(preferenceRows.map((row) => [row.id, row]));
    return base.map((item) => {
      const preference = byTeam.get(item.id)!;
      return {
        ...item, preferenceStatus: preference.status,
        preferences: preference.preferences.flatMap((id) => byId.get(id) ?? []),
        assignedTrack: preference.assignedTrackId ? byId.get(preference.assignedTrackId) ?? null : null
      };
    });
  }),
  exportTeams: teamsProcedure.input(roundInput).query(async ({ input }) => {
    const teamRows = await getExportTeamRows(input.round);
    if (!teamRows.length) return [];
    const { member } = registrationTables(input.round);
    const memberRows = await db.select({
      id: member.id, teamId: member.teamId, fullName: member.fullName,
      email: member.email, birthdate: member.birthdate, universityName: member.universityName,
      isCaptain: member.isCaptain
    }).from(member)
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
        eliminatedTeams: sql<number>`count(*) filter (where ${team.isEliminated} = true)`,
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
      eliminatedTeams: Number(teamStats?.eliminatedTeams ?? 0),
      awarenessSourceCounts,
    };
  }),
  getTeam: teamsProcedure.input(roundInput.extend({ teamId: z.string().trim().min(1).max(128) })).query(async ({ input }) => {
    const { team: teamTable, member } = registrationTables(input.round);
    const { captainName, captainEmail } = captainExpressions(teamTable, member);
    const [team] = await db.select({
      id: teamTable.id, name: teamTable.teamName, status: teamTable.registrationStatus,
      isEliminated: teamTable.isEliminated, createdAt: teamTable.createdAt, captainName, captainEmail,
      captainPhone: teamTable.captainPhone,
      awarenessSource: teamTable.awarenessSource, awarenessSourceDetail: teamTable.awarenessSourceDetail
    })
      .from(teamTable).where(eq(teamTable.id, input.teamId)).limit(1);
    if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
    const roster = await db.select({
      id: member.id, fullName: member.fullName, email: member.email,
      birthdate: member.birthdate, universityName: member.universityName, isCaptain: member.isCaptain
    }).from(member)
      .where(eq(member.teamId, team.id)).orderBy(desc(member.isCaptain), asc(member.fullName));
    let admissionMethod: "direct" | "cv_screening" | "round_0_5_promotion" | "promotion" = input.round === "0.5" ? "direct" : "promotion";
    let preferenceStatus: "not_submitted" | "submitted" | "assigned" | null = null;
    let preferences: { id: string; name: string }[] = [];
    let assignedTrack: { id: string; name: string } | null = null;
    if (input.round === "1") {
      const [source] = await db.select({
        admissionMethod: roundOneTeams.admissionMethod,
        preferenceStatus: roundOneTeams.preferenceStatus, preferences: roundOneTeams.preferences,
        assignedTrackId: roundOneTeams.assignedTrackId
      }).from(roundOneTeams)
        .where(eq(roundOneTeams.id, input.teamId)).limit(1);
      admissionMethod = source?.admissionMethod ?? "promotion";
      preferenceStatus = source?.preferenceStatus ?? null;
      preferences = await resolveRoundOnePreferences(source?.preferences ?? []);
      assignedTrack = preferences.find((preference) => preference.id === source?.assignedTrackId) ?? null;
    }
    const cvs = input.round === "1" ? await db.select({
      memberId: roundOneMemberCvs.memberId,
      filename: roundOneMemberCvs.originalFilename, fileSize: roundOneMemberCvs.fileSize
    })
      .from(roundOneMemberCvs).innerJoin(roundOneMembers, eq(roundOneMemberCvs.memberId, roundOneMembers.id))
      .where(eq(roundOneMembers.teamId, input.teamId)) : [];
    return {
      ...team, round: input.round, admissionMethod, preferenceStatus, preferences, assignedTrack,
      members: roster.map((item) => ({
        ...item,
        cv: cvs.find((cv) => cv.memberId === item.id) ?? null
      }))
    };
  }),
  updateTeamStatus: teamsProcedure.input(roundInput.extend({
    teamId: z.string().trim().min(1).max(128), status: registrationDecisionSchema,
  })).mutation(async ({ input }) => {
    if (input.round === "1") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "ROUND_ONE_DECISIONS_USE_CV_SCREENING" });
    }
    const { team } = registrationTables(input.round);
    const [existing] = await db.select({
      id: team.id, status: team.registrationStatus,
    }).from(team).where(eq(team.id, input.teamId)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
    if (existing.status === input.status) {
      throw new TRPCError({ code: "CONFLICT", message: "Team already has this registration status" });
    }

    const [result] = await db.update(team).set({
      registrationStatus: input.status,
      approvalSequence: sql`${team.approvalSequence} + 1`,
      ...(input.status === "approved" ? {} : { isEliminated: false }),
    }).where(and(
      eq(team.id, existing.id),
      eq(team.registrationStatus, existing.status),
      ne(team.registrationStatus, input.status),
    )).returning({ id: team.id, status: team.registrationStatus });
    if (!result) throw new TRPCError({ code: "CONFLICT", message: "Team status changed while updating" });
    return result;
  }),
  setTeamsEliminated: teamsProcedure.input(teamEliminationInput).mutation(async ({ input }) => {
    if (new Set(input.teamIds).size !== input.teamIds.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "DUPLICATE_TEAM_IDS" });
    }
    const { team } = registrationTables(input.round);
    const selectedTeams = await db.select({
      id: team.id, status: team.registrationStatus,
    }).from(team).where(inArray(team.id, input.teamIds));
    if (selectedTeams.length !== input.teamIds.length
      || selectedTeams.some((selectedTeam) => selectedTeam.status !== "approved")) {
      throw new TRPCError({ code: "CONFLICT", message: "TEAMS_NOT_ELIGIBLE_FOR_ELIMINATION_UPDATE" });
    }
    const update = await db.execute(sql`
      with requested as (
        select requested_id.value as id
        from jsonb_array_elements_text(${JSON.stringify(input.teamIds)}::jsonb) as requested_id(value)
      ), eligible as (
        select ${team.id} as id
        from ${team}
        inner join requested on requested.id = ${team.id}
        where ${team.registrationStatus} = 'approved'
      ), updated as (
        update ${team}
        set "is_eliminated" = ${input.isEliminated}
        where ${team.id} in (select eligible.id from eligible)
          and (select count(*) from eligible) = (select count(*) from requested)
          and ${team.isEliminated} <> ${input.isEliminated}
        returning ${team.id}
      )
      select
        (select count(*)::integer from requested) as requested_count,
        (select count(*)::integer from eligible) as eligible_count,
        (select count(*)::integer from updated) as changed_count
    `);
    const result = update.rows[0] as {
      requested_count: number; eligible_count: number; changed_count: number
    } | undefined;
    if (!result || Number(result.eligible_count) !== input.teamIds.length) {
      throw new TRPCError({ code: "CONFLICT", message: "TEAMS_NOT_ELIGIBLE_FOR_ELIMINATION_UPDATE" });
    }
    return { updatedCount: Number(result.requested_count), isEliminated: input.isEliminated };
  }),
  promoteTeams: teamsProcedure.input(promotionPairSchema).mutation(async ({ input }) => {
    if (new Set(input.teamIds).size !== input.teamIds.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "DUPLICATE_TEAM_IDS" });
    }
    const results = [];
    for (const teamId of input.teamIds) results.push(await promoteOne(input, teamId));
    return { results };
  }),
  createTeamCvUrl: teamsProcedure.input(z.object({
    teamId: z.string().min(1).max(128),
    memberId: z.string().min(1).max(128), disposition: z.enum(["inline", "attachment"]).default("inline")
  }))
    .mutation(async ({ input }) => {
      const [cv] = await db.select({
        objectKey: roundOneMemberCvs.objectKey,
        filename: roundOneMemberCvs.originalFilename
      }).from(roundOneMemberCvs)
        .innerJoin(roundOneMembers, eq(roundOneMemberCvs.memberId, roundOneMembers.id))
        .where(and(eq(roundOneMembers.teamId, input.teamId), eq(roundOneMemberCvs.memberId, input.memberId))).limit(1);
      if (!cv) throw new TRPCError({ code: "NOT_FOUND", message: "CV_NOT_FOUND" });
      const safeFilename = cv.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
      return {
        url: await getSignedUrl(s3, new GetObjectCommand({
          Bucket: env.R2_BUCKET, Key: cv.objectKey,
          ResponseContentType: "application/pdf",
          ResponseContentDisposition: `${input.disposition}; filename="${safeFilename}"`
        }), { expiresIn: signedUrlExpirySeconds })
      };
    }),
  getRoundOneCvScreeningStats: roundOneCvScreeningProcedure.query(async () => {
    const queue = roundOneCvScreeningQueue();
    const [statsRows, assignmentRows, activeTracks] = await Promise.all([
      db.select({
        totalTeams: count(),
        waitingForPreferences: sql<number>`count(*) filter (where ${roundOneTeams.preferenceStatus} = ${"not_submitted"})`,
        pendingScreening: sql<number>`count(*) filter (where ${roundOneTeams.registrationStatus} = ${"pending"})`,
        approvedTeams: sql<number>`count(*) filter (where ${roundOneTeams.registrationStatus} = ${"approved"})`,
        rejectedTeams: sql<number>`count(*) filter (where ${roundOneTeams.registrationStatus} = ${"rejected"})`,
        assignedTeams: sql<number>`count(*) filter (where ${roundOneTeams.preferenceStatus} = ${"assigned"})`,
      }).from(roundOneTeams).where(queue),
      db.select({ trackId: roundOneTeams.assignedTrackId, assignedTeams: count() }).from(roundOneTeams)
        .where(and(queue, isNotNull(roundOneTeams.assignedTrackId)))
        .groupBy(roundOneTeams.assignedTrackId),
      getRoundOnePreferenceSettings(true),
    ]);
    const [stats] = statsRows;
    const assignmentsByTrack = new Map(assignmentRows.map((row) => [row.trackId, Number(row.assignedTeams)]));
    return {
      totalTeams: Number(stats?.totalTeams ?? 0),
      waitingForPreferences: Number(stats?.waitingForPreferences ?? 0),
      pendingScreening: Number(stats?.pendingScreening ?? 0),
      approvedTeams: Number(stats?.approvedTeams ?? 0),
      rejectedTeams: Number(stats?.rejectedTeams ?? 0),
      assignedTeams: Number(stats?.assignedTeams ?? 0),
      trackAssignments: activeTracks.map((track) => ({
        trackId: track.id,
        trackName: track.name,
        assignedTeams: assignmentsByTrack.get(track.id) ?? 0,
      })),
    };
  }),
  listRoundOneCvScreeningTeams: roundOneCvScreeningProcedure.query(async () => {
    const { captainName, captainEmail } = captainExpressions(
      roundOneTeams as unknown as typeof teams,
      roundOneMembers as unknown as typeof members,
    );
    const teamRows = await db.select({
      id: roundOneTeams.id, name: roundOneTeams.teamName,
      registrationStatus: roundOneTeams.registrationStatus, admissionMethod: roundOneTeams.admissionMethod,
      preferenceStatus: roundOneTeams.preferenceStatus, preferences: roundOneTeams.preferences,
      assignedTrackId: roundOneTeams.assignedTrackId, createdAt: roundOneTeams.createdAt,
      preferenceSubmittedAt: roundOneTeams.preferenceSubmittedAt, captainName, captainEmail
    })
      .from(roundOneTeams).where(roundOneCvScreeningQueue())
      .orderBy(asc(sql`coalesce(${roundOneTeams.preferenceSubmittedAt}, ${roundOneTeams.createdAt})`),
        asc(roundOneTeams.teamName));
    if (!teamRows.length) return [];
    const [memberRows, settings] = await Promise.all([
      db.select({
        id: roundOneMembers.id, teamId: roundOneMembers.teamId,
        fullName: roundOneMembers.fullName, isCaptain: roundOneMembers.isCaptain,
        cvFilename: roundOneMemberCvs.originalFilename, cvFileSize: roundOneMemberCvs.fileSize
      })
        .from(roundOneMembers).leftJoin(roundOneMemberCvs, eq(roundOneMemberCvs.memberId, roundOneMembers.id))
        .where(inArray(roundOneMembers.teamId, teamRows.map((team) => team.id)))
        .orderBy(desc(roundOneMembers.isCaptain), asc(roundOneMembers.fullName)),
      getRoundOnePreferenceSettings(false),
    ]);
    const settingById = new Map(settings.map((setting) => [setting.id, { id: setting.id, name: setting.name }]));
    return teamRows.map((team) => ({
      ...team,
      readyAt: team.preferenceSubmittedAt ?? team.createdAt,
      preferences: team.preferences.flatMap((id) => settingById.get(id) ?? []),
      assignedTrack: team.assignedTrackId ? settingById.get(team.assignedTrackId) ?? null : null,
      members: memberRows.filter((member) => member.teamId === team.id).map(({ teamId: _teamId, ...member }) => member),
    }));
  }),
  decideRoundOneCvScreeningTeam: roundOneCvScreeningProcedure.input(z.discriminatedUnion("status", [
    z.object({
      teamId: z.string().trim().min(1).max(128), status: z.literal("approved"),
      trackId: z.string().trim().min(1).max(128)
    }),
    z.object({ teamId: z.string().trim().min(1).max(128), status: z.literal("rejected") }),
  ])).mutation(({ input }) => decideRoundOneCvTeam(input)),
  assignRoundOneTrack: roundOneCvScreeningProcedure.input(z.object({
    teamId: z.string().trim().min(1).max(128),
    trackId: z.string().trim().min(1).max(128)
  })).mutation(({ input }) => assignRoundOneTrack(input)),
  createRoundOneScreeningCvUrl: roundOneCvScreeningProcedure.input(z.object({
    teamId: z.string().min(1).max(128), memberId: z.string().min(1).max(128),
    disposition: z.enum(["inline", "attachment"]).default("inline"),
  })).mutation(async ({ input }) => {
    const [cv] = await db.select({
      objectKey: roundOneMemberCvs.objectKey,
      filename: roundOneMemberCvs.originalFilename
    }).from(roundOneMemberCvs)
      .innerJoin(roundOneMembers, eq(roundOneMemberCvs.memberId, roundOneMembers.id))
      .where(and(eq(roundOneMembers.teamId, input.teamId), eq(roundOneMemberCvs.memberId, input.memberId))).limit(1);
    if (!cv) throw new TRPCError({ code: "NOT_FOUND", message: "CV_NOT_FOUND" });
    const safeFilename = cv.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
    return {
      url: await getSignedUrl(s3, new GetObjectCommand({
        Bucket: env.R2_BUCKET, Key: cv.objectKey,
        ResponseContentType: "application/pdf",
        ResponseContentDisposition: `${input.disposition}; filename="${safeFilename}"`
      }), { expiresIn: signedUrlExpirySeconds })
    };
  }),
  listMailCampaigns: mailProcedure.input(z.object({ archived: z.boolean().default(false) }))
    .query(({ input }) => listMailCampaigns(input.archived)),
  getMailCampaign: mailProcedure.input(z.object({ campaignId: z.string().trim().min(1).max(128) }))
    .query(async ({ input }) => {
      const campaign = await findMailCampaign(input.campaignId);
      return { ...campaign, input: campaignRowToInput(campaign) };
    }),
  createMailCampaign: mailProcedure.input(mailCampaignInputSchema).mutation(async ({ ctx, input }) => {
    const [campaign] = await db.insert(mailCampaigns).values({
      ...input,
      createdByUserId: ctx.session.user.id,
    }).returning({ id: mailCampaigns.id });
    return campaign!;
  }),
  updateMailCampaign: mailProcedure.input(mailCampaignInputSchema.extend({
    campaignId: z.string().trim().min(1).max(128),
  })).mutation(async ({ input }) => {
    const { campaignId, ...changes } = input;
    const [campaign] = await db.update(mailCampaigns).set({ ...changes, updatedAt: new Date() })
      .where(and(eq(mailCampaigns.id, campaignId), sql`${mailCampaigns.archivedAt} is null`))
      .returning({ id: mailCampaigns.id, updatedAt: mailCampaigns.updatedAt });
    if (!campaign) throw new TRPCError({ code: "CONFLICT", message: "MAIL_CAMPAIGN_ARCHIVED_OR_MISSING" });
    return campaign;
  }),
  setMailCampaignArchived: mailProcedure.input(z.object({
    campaignId: z.string().trim().min(1).max(128), archived: z.boolean(),
  })).mutation(async ({ input }) => {
    const [campaign] = await db.update(mailCampaigns).set({
      archivedAt: input.archived ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(mailCampaigns.id, input.campaignId))
      .returning({ id: mailCampaigns.id, archivedAt: mailCampaigns.archivedAt });
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "MAIL_CAMPAIGN_NOT_FOUND" });
    return campaign;
  }),
  previewMailCampaign: mailProcedure.input(z.object({
    campaign: mailCampaignInputSchema,
    teamId: z.string().trim().min(1).max(128).optional(),
  })).mutation(({ input }) => previewMailCampaign(input.campaign, input.teamId)),
  listMailCampaignTeams: mailProcedure.input(z.object({
    campaignId: z.string().trim().min(1).max(128),
    status: z.enum(["all", "not_sent", "failed", "sent"]).default("all"),
    search: z.string().max(200).optional(),
  })).query(({ input }) => listMailCampaignTeams(input)),
  sendMailCampaignTeam: mailProcedure.input(z.object({
    campaignId: z.string().trim().min(1).max(128),
    teamId: z.string().trim().min(1).max(128),
  })).mutation(({ input }) => sendMailCampaignTeam(input.campaignId, input.teamId)),
  getLatestRoundPdfExport: roundsProcedure.input(roundInput).query(async ({ input }) => {
    const [job] = await db.select({
      id: pdfExportJobs.id, status: pdfExportJobs.status,
      fileCount: pdfExportJobs.fileCount, totalSourceBytes: pdfExportJobs.totalSourceBytes,
      archiveBytes: pdfExportJobs.archiveBytes, createdAt: pdfExportJobs.createdAt, startedAt: pdfExportJobs.startedAt,
      completedAt: pdfExportJobs.completedAt, expiresAt: pdfExportJobs.expiresAt
    })
      .from(pdfExportJobs).where(eq(pdfExportJobs.round, input.round))
      .orderBy(desc(pdfExportJobs.createdAt)).limit(1);
    return job ? { ...job, wakeUrl: pdfExporterHealthUrl } : null;
  }),
  createRoundPdfExport: roundsProcedure.input(roundInput).mutation(async ({ ctx, input }) => {
    const [created] = await db.insert(pdfExportJobs).values({
      id: crypto.randomUUID(), round: input.round, requestedByUserId: ctx.session.user.id,
    }).onConflictDoNothing().returning({ id: pdfExportJobs.id, status: pdfExportJobs.status });
    if (created) return { ...created, wakeUrl: pdfExporterHealthUrl };

    const [active] = await db.select({ id: pdfExportJobs.id, status: pdfExportJobs.status })
      .from(pdfExportJobs).where(and(eq(pdfExportJobs.round, input.round),
        inArray(pdfExportJobs.status, ["pending", "processing"])))
      .orderBy(desc(pdfExportJobs.createdAt)).limit(1);
    if (active) return { ...active, wakeUrl: pdfExporterHealthUrl };
    throw new TRPCError({ code: "CONFLICT", message: "PDF_EXPORT_CONFLICT" });
  }),
  createRoundPdfExportDownloadUrl: roundsProcedure.input(pdfExportInput).mutation(async ({ input }) => {
    const [job] = await db.select({
      objectKey: pdfExportJobs.archiveObjectKey,
      filename: pdfExportJobs.archiveFilename
    }).from(pdfExportJobs).where(and(
      eq(pdfExportJobs.id, input.exportId), eq(pdfExportJobs.round, input.round),
      eq(pdfExportJobs.status, "completed"), gt(pdfExportJobs.expiresAt, new Date()),
    )).limit(1);
    if (!job?.objectKey) {
      throw new TRPCError({ code: "NOT_FOUND", message: "PDF_EXPORT_NOT_AVAILABLE" });
    }
    const filename = job.filename ?? roundSubmissionArchiveFilename(input.round);
    return {
      downloadUrl: await getSignedUrl(s3, new GetObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: job.objectKey, ResponseContentType: "application/zip",
        ResponseContentDisposition: attachmentContentDisposition(filename)
      }),
        { expiresIn: signedUrlExpirySeconds })
    };
  }),
  listRoundSubmissions: roundsProcedure.input(roundInput).query(async ({ input }) => {
    const { team, member, submission } = submissionTables(input.round);
    const { captainName, captainEmail } = captainExpressions(team, member);
    return db.select({
      id: submission.id, teamId: team.id, teamName: team.teamName,
      teamStatus: team.registrationStatus, captainName, captainEmail,
      originalFilename: submission.originalFilename, mimeType: submission.mimeType,
      fileSize: submission.fileSize, createdAt: submission.createdAt, updatedAt: submission.updatedAt,
      feedbackDrafted: sql<boolean>`${submission.feedback} is not null and ${submission.feedbackPublished} = false`
    })
      .from(submission).innerJoin(team, eq(submission.teamId, team.id))
      .where(and(eq(submission.round, input.round), latestSubmission(submission)))
      .orderBy(desc(submission.updatedAt), asc(team.teamName));
  }),
  getRoundSubmission: roundsProcedure.input(submissionInput).query(async ({ input }) => {
    const { team, member, submission: submissionTable } = submissionTables(input.round);
    const { captainName, captainEmail } = captainExpressions(team, member);
    const [submission] = await db.select({
      id: submissionTable.id, description: submissionTable.description,
      feedback: submissionTable.feedback, score: submissionTable.score,
      feedbackPublished: submissionTable.feedbackPublished,
      originalFilename: submissionTable.originalFilename, mimeType: submissionTable.mimeType,
      fileSize: submissionTable.fileSize, createdAt: submissionTable.createdAt, updatedAt: submissionTable.updatedAt,
      teamId: team.id, teamName: team.teamName, teamStatus: team.registrationStatus, teamCreatedAt: team.createdAt,
      captainName, captainEmail, captainPhone: team.captainPhone,
    }).from(submissionTable).innerJoin(team, eq(submissionTable.teamId, team.id))
      .where(identifiedSubmission(input)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    const roster = await db.select({
      id: member.id, fullName: member.fullName, email: member.email,
      birthdate: member.birthdate, universityName: member.universityName, isCaptain: member.isCaptain
    }).from(member)
      .where(eq(member.teamId, submission.teamId)).orderBy(desc(member.isCaptain), asc(member.fullName));
    return { ...submission, members: roster };
  }),
  saveRoundFeedbackDraft: roundsProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const { submission: table } = submissionTables(input.round);
    const [submission] = await db.update(table)
      .set({ feedback: input.feedback, ...(input.score !== undefined && { score: input.score }), feedbackPublished: false })
      .where(identifiedSubmission(input)).returning({ id: table.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" }); return { success: true };
  }),
  publishRoundFeedback: roundsProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const { submission: table } = submissionTables(input.round);
    const [submission] = await db.update(table)
      .set({ feedback: input.feedback, ...(input.score !== undefined && { score: input.score }), feedbackPublished: true })
      .where(identifiedSubmission(input)).returning({ id: table.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" }); return { success: true };
  }),
  publishAllRoundFeedbackDrafts: roundsProcedure.input(roundInput).mutation(async ({ input }) => {
    const { submission: table } = submissionTables(input.round);
    const published = await db.update(table).set({ feedbackPublished: true }).where(and(
      eq(table.round, input.round),
      eq(table.feedbackPublished, false),
      isNotNull(table.feedback),
      latestSubmission(table),
    )).returning({ id: table.id });
    return { publishedCount: published.length };
  }),
  createRoundDownloadUrl: roundsProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findSubmissionFile(input);
    return {
      downloadUrl: await getSignedUrl(s3, new GetObjectCommand({
        Bucket: env.R2_BUCKET, Key: submission.objectKey,
        ResponseContentDisposition: attachmentContentDisposition(submission.filename)
      }), { expiresIn: signedUrlExpirySeconds })
    };
  }),
  createRoundPreviewUrl: roundsProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findSubmissionFile(input);
    if (submission.mimeType !== "application/pdf") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "UNSUPPORTED_PREVIEW" });
    }
    const sourceUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentType: "application/pdf", ResponseContentDisposition: "inline"
    }), { expiresIn: signedUrlExpirySeconds });
    return { previewUrl: sourceUrl };
  }),
});
