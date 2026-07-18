import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@masc-landing/db";
import { members, roundSubmissions, teams } from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { roundSchema } from "../rounds";
import { getSubmissionSettings, requireSubmissionOpen } from "../submission-settings";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const URL_EXPIRY_SECONDS = 300;
const allowedFiles: Record<string, string> = {
  ".pdf": "application/pdf", ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
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
async function membershipFor(userId: string, email: string) {
  const [membership] = await db.select({
    memberId: members.id,
    teamId: members.teamId,
    registrationStatus: teams.registrationStatus,
  }).from(members)
    .innerJoin(teams, eq(members.teamId, teams.id))
    .where(or(
      and(eq(teams.captainId, userId), eq(members.isCaptain, true)),
      sql`lower(${members.email}) = ${email.trim().toLowerCase()}`,
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
function submissionWhere(teamId: string, round: string) {
  return and(eq(roundSubmissions.teamId, teamId), eq(roundSubmissions.round, round));
}
async function attemptsUsed(teamId: string, round: string) {
  const [result] = await db.select({ value: sql<number>`coalesce(max(${roundSubmissions.attemptNumber}), 0)` })
    .from(roundSubmissions).where(submissionWhere(teamId, round));
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
    const membership = await membershipFor(ctx.session.user.id, ctx.session.user.email);
    const settings = await getSubmissionSettings();
    const [submission] = await db.select({
      description: roundSubmissions.description, originalFilename: roundSubmissions.originalFilename,
      mimeType: roundSubmissions.mimeType, fileSize: roundSubmissions.fileSize,
      attemptNumber: roundSubmissions.attemptNumber,
      feedback: sql<string | null>`case when ${roundSubmissions.feedbackPublished} then ${roundSubmissions.feedback} else null end`,
      createdAt: roundSubmissions.createdAt, updatedAt: roundSubmissions.updatedAt,
    }).from(roundSubmissions).where(submissionWhere(membership.teamId, input.round))
      .orderBy(desc(roundSubmissions.attemptNumber)).limit(1);
    const used = submission?.attemptNumber ?? 0;
    const isApproved = membership.registrationStatus === "approved";
    return { submission: submission ?? null, isSubmissionOpen: isApproved && settings[input.round], attemptsUsed: used,
      attemptsRemaining: MAX_ATTEMPTS - used, maxAttempts: MAX_ATTEMPTS,
      canSubmit: isApproved && settings[input.round] && used < MAX_ATTEMPTS };
  }),
  createUploadUrl: protectedProcedure.input(fileInput).mutation(async ({ ctx, input }) => {
    const membership = await membershipFor(ctx.session.user.id, ctx.session.user.email);
    requireApprovedTeam(membership.registrationStatus);
    await requireSubmissionOpen(input.round);
    if (await attemptsUsed(membership.teamId, input.round) >= MAX_ATTEMPTS) {
      throw new TRPCError({ code: "CONFLICT", message: "ATTEMPT_LIMIT_REACHED" });
    }
    const uploadId = crypto.randomUUID();
    const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: env.R2_BUCKET,
      Key: objectKey(input.round, membership.teamId, uploadId, validateFile(input)), ContentType: input.mimeType,
      ContentLength: input.fileSize }), { expiresIn: URL_EXPIRY_SECONDS });
    return { uploadId, uploadUrl, expiresIn: URL_EXPIRY_SECONDS };
  }),
  finalize: protectedProcedure.input(fileInput.extend({ uploadId: z.uuid(), description: z.string().trim().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const membership = await membershipFor(ctx.session.user.id, ctx.session.user.email);
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
            select coalesce(max(${roundSubmissions.attemptNumber}), 0) + 1 as attempt_number
            from ${roundSubmissions}
            where ${roundSubmissions.teamId} = ${membership.teamId} and ${roundSubmissions.round} = ${input.round}
          )
          insert into ${roundSubmissions} (id, team_id, round, attempt_number, submitted_by_member_id, description,
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
  createDownloadUrl: protectedProcedure.input(roundInput).mutation(async ({ ctx, input }) => {
    const membership = await membershipFor(ctx.session.user.id, ctx.session.user.email);
    const [submission] = await db.select({ objectKey: roundSubmissions.objectKey, filename: roundSubmissions.originalFilename })
      .from(roundSubmissions).where(submissionWhere(membership.teamId, input.round))
      .orderBy(desc(roundSubmissions.attemptNumber)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "SUBMISSION_NOT_FOUND" });
    const safeFilename = submission.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
    return { downloadUrl: await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"` }), { expiresIn: URL_EXPIRY_SECONDS }) };
  }),
  createPreviewUrl: protectedProcedure.input(roundInput).mutation(async ({ ctx, input }) => {
    const membership = await membershipFor(ctx.session.user.id, ctx.session.user.email);
    const [submission] = await db.select({ objectKey: roundSubmissions.objectKey, mimeType: roundSubmissions.mimeType })
      .from(roundSubmissions).where(submissionWhere(membership.teamId, input.round))
      .orderBy(desc(roundSubmissions.attemptNumber)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "SUBMISSION_NOT_FOUND" });
    const sourceUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentType: submission.mimeType, ResponseContentDisposition: "inline" }), { expiresIn: URL_EXPIRY_SECONDS });
    return { previewUrl: submission.mimeType === "application/pdf" ? sourceUrl : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}` };
  }),
});
