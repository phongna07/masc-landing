import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@masc-landing/db";
import { members, roundOneMembers, roundOneSubmissions, roundOneTeams, roundSubmissions,
  roundThreeMembers, roundThreeSubmissions, roundThreeTeams, roundTwoMembers, roundTwoSubmissions,
  roundTwoTeams, teams } from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";

import { freshProtectedProcedure, protectedProcedure, router } from "../index";
import { roundSchema, type RoundId } from "../rounds";
import { getSubmissionSettings, requireSubmissionOpen } from "../submission-settings";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const URL_EXPIRY_SECONDS = 300;
const allowedFiles: Record<string, string> = { ".pdf": "application/pdf" };
const roundInput = z.object({ round: roundSchema });
const fileInput = roundInput.extend({
  filename: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(160),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
});

const s3 = new S3Client({
  region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

function extensionOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot).toLowerCase();
}
function validateFile(file: z.infer<typeof fileInput>) {
  const extension = extensionOf(file.filename);
  if (allowedFiles[extension] !== file.mimeType) throw new TRPCError({ code: "BAD_REQUEST", message: "UNSUPPORTED_FILE" });
  return extension;
}
function tablesForRound(round: RoundId) {
  if (round === "0.5") return { team: teams, member: members, submission: roundSubmissions };
  if (round === "1") return { team: roundOneTeams as unknown as typeof teams,
    member: roundOneMembers as unknown as typeof members, submission: roundOneSubmissions as unknown as typeof roundSubmissions };
  if (round === "2") return { team: roundTwoTeams as unknown as typeof teams,
    member: roundTwoMembers as unknown as typeof members, submission: roundTwoSubmissions as unknown as typeof roundSubmissions };
  return { team: roundThreeTeams as unknown as typeof teams,
    member: roundThreeMembers as unknown as typeof members, submission: roundThreeSubmissions as unknown as typeof roundSubmissions };
}

async function membershipFor(round: RoundId, userId: string, email: string) {
  const { team, member } = tablesForRound(round);
  const [membership] = await db.select({
    memberId: member.id,
    teamId: member.teamId,
    registrationStatus: team.registrationStatus,
  }).from(member)
    .innerJoin(team, eq(member.teamId, team.id))
    .where(or(
      and(eq(team.captainId, userId), eq(member.isCaptain, true)),
      sql`lower(${member.email}) = ${email.trim().toLowerCase()}`,
    )).limit(1);
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "TEAM_REQUIRED" });
  return membership;
}
function requireApprovedTeam(registrationStatus: "pending" | "approved" | "rejected") {
  if (registrationStatus !== "approved") {
    throw new TRPCError({ code: "FORBIDDEN", message: "TEAM_NOT_APPROVED" });
  }
}
function objectKey(round: string, teamId: string, uploadId: string, extension: string) {
  return `round-${round}/${teamId}/${uploadId}${extension}`;
}
async function bestEffortDelete(key: string) {
  try { await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key })); } catch { /* persisted submissions survive cleanup failures */ }
}
function submissionWhere(submission: typeof roundSubmissions, teamId: string, round: string) {
  return and(eq(submission.teamId, teamId), eq(submission.round, round));
}
async function attemptsUsed(submission: typeof roundSubmissions, teamId: string, round: string) {
  const [result] = await db.select({ value: sql<number>`coalesce(max(${submission.attemptNumber}), 0)` })
    .from(submission).where(submissionWhere(submission, teamId, round));
  return Number(result?.value ?? 0);
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

export const roundSubmissionRouter = router({
  current: protectedProcedure.input(roundInput).query(async ({ ctx, input }) => {
    const { submission: submissionTable } = tablesForRound(input.round);
    const membership = await membershipFor(input.round, ctx.session.user.id, ctx.session.user.email);
    const settings = await getSubmissionSettings();
    const [submission] = await db.select({
      description: submissionTable.description, originalFilename: submissionTable.originalFilename,
      mimeType: submissionTable.mimeType, fileSize: submissionTable.fileSize,
      attemptNumber: submissionTable.attemptNumber,
      feedback: sql<string | null>`case when ${submissionTable.feedbackPublished} then ${submissionTable.feedback} else null end`,
      score: sql<number | null>`case when ${submissionTable.feedbackPublished} then ${submissionTable.score} else null end`,
      createdAt: submissionTable.createdAt, updatedAt: submissionTable.updatedAt,
    }).from(submissionTable).where(submissionWhere(submissionTable, membership.teamId, input.round))
      .orderBy(desc(submissionTable.attemptNumber)).limit(1);
    const used = submission?.attemptNumber ?? 0;
    const isApproved = membership.registrationStatus === "approved";
    return { submission: submission ?? null, isSubmissionOpen: isApproved && settings[input.round], attemptsUsed: used,
      attemptsRemaining: MAX_ATTEMPTS - used, maxAttempts: MAX_ATTEMPTS,
      canSubmit: isApproved && settings[input.round] && used < MAX_ATTEMPTS };
  }),
  createUploadUrl: freshProtectedProcedure.input(fileInput).mutation(async ({ ctx, input }) => {
    const { submission } = tablesForRound(input.round);
    const membership = await membershipFor(input.round, ctx.session.user.id, ctx.session.user.email);
    requireApprovedTeam(membership.registrationStatus);
    await requireSubmissionOpen(input.round);
    if (await attemptsUsed(submission, membership.teamId, input.round) >= MAX_ATTEMPTS) {
      throw new TRPCError({ code: "CONFLICT", message: "ATTEMPT_LIMIT_REACHED" });
    }
    const uploadId = crypto.randomUUID();
    const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: env.R2_BUCKET,
      Key: objectKey(input.round, membership.teamId, uploadId, validateFile(input)), ContentType: input.mimeType,
      ContentLength: input.fileSize }), { expiresIn: URL_EXPIRY_SECONDS });
    return { uploadId, uploadUrl, expiresIn: URL_EXPIRY_SECONDS };
  }),
  finalize: freshProtectedProcedure.input(fileInput.extend({ uploadId: z.uuid(), description: z.string().trim().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const { submission } = tablesForRound(input.round);
      const membership = await membershipFor(input.round, ctx.session.user.id, ctx.session.user.email);
      requireApprovedTeam(membership.registrationStatus);
      const key = objectKey(input.round, membership.teamId, input.uploadId, validateFile(input));
      try { await requireSubmissionOpen(input.round); } catch (error) {
        await bestEffortDelete(key); throw error;
      }
      let object;
      try { object = await s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key })); }
      catch { throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_NOT_FOUND" }); }
      if (object.ContentLength !== input.fileSize || object.ContentType !== input.mimeType) {
        await bestEffortDelete(key); throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_MISMATCH" });
      }
      const submissionId = crypto.randomUUID();
      try {
        const inserted = await db.execute(sql`
          with next_attempt as (
            select coalesce(max(${submission.attemptNumber}), 0) + 1 as attempt_number
            from ${submission}
            where ${submission.teamId} = ${membership.teamId} and ${submission.round} = ${input.round}
          )
          insert into ${submission} (id, team_id, round, attempt_number, submitted_by_member_id, description,
            object_key, original_filename, mime_type, file_size)
          select ${submissionId}, ${membership.teamId}, ${input.round}, next_attempt.attempt_number,
            ${membership.memberId}, ${input.description}, ${key}, ${input.filename}, ${input.mimeType}, ${input.fileSize}
          from next_attempt where next_attempt.attempt_number <= ${MAX_ATTEMPTS}
          returning attempt_number
        `);
        if (inserted.rows.length === 0) {
          throw new TRPCError({ code: "CONFLICT", message: "ATTEMPT_LIMIT_REACHED" });
        }
        return { success: true, attemptNumber: Number(inserted.rows[0]!.attempt_number) };
      } catch (error) {
        await bestEffortDelete(key);
        if (error instanceof TRPCError) throw error;
        if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "SUBMISSION_CONFLICT" });
        throw error;
      }
    }),
  createDownloadUrl: freshProtectedProcedure.input(roundInput).mutation(async ({ ctx, input }) => {
    const { submission: submissionTable } = tablesForRound(input.round);
    const membership = await membershipFor(input.round, ctx.session.user.id, ctx.session.user.email);
    const [submission] = await db.select({ objectKey: submissionTable.objectKey, filename: submissionTable.originalFilename })
      .from(submissionTable).where(submissionWhere(submissionTable, membership.teamId, input.round))
      .orderBy(desc(submissionTable.attemptNumber)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "SUBMISSION_NOT_FOUND" });
    const safeFilename = submission.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
    return { downloadUrl: await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"` }), { expiresIn: URL_EXPIRY_SECONDS }) };
  }),
  createPreviewUrl: freshProtectedProcedure.input(roundInput).mutation(async ({ ctx, input }) => {
    const { submission: submissionTable } = tablesForRound(input.round);
    const membership = await membershipFor(input.round, ctx.session.user.id, ctx.session.user.email);
    const [submission] = await db.select({ objectKey: submissionTable.objectKey, mimeType: submissionTable.mimeType })
      .from(submissionTable).where(submissionWhere(submissionTable, membership.teamId, input.round))
      .orderBy(desc(submissionTable.attemptNumber)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "SUBMISSION_NOT_FOUND" });
    if (submission.mimeType !== "application/pdf") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "UNSUPPORTED_PREVIEW" });
    }
    const sourceUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentType: "application/pdf", ResponseContentDisposition: "inline" }), { expiresIn: URL_EXPIRY_SECONDS });
    return { previewUrl: sourceUrl };
  }),
});
