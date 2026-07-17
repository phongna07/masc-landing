import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@masc-landing/db";
import { members, roundSubmissions, teams } from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { roundSchema } from "../rounds";
import { getSubmissionSettings, requireSubmissionOpen } from "../submission-settings";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
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
  const [membership] = await db.select({ teamId: members.teamId, isCaptain: members.isCaptain }).from(members)
    .innerJoin(teams, eq(members.teamId, teams.id))
    .where(or(
      and(eq(teams.captainId, userId), eq(members.isCaptain, true)),
      sql`lower(${members.email}) = ${email.trim().toLowerCase()}`,
    )).limit(1);
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "TEAM_REQUIRED" });
  return membership;
}
function requireCaptain(membership: Awaited<ReturnType<typeof membershipFor>>) {
  if (!membership.isCaptain) throw new TRPCError({ code: "FORBIDDEN", message: "CAPTAIN_REQUIRED" });
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

export const roundSubmissionRouter = router({
  current: protectedProcedure.input(roundInput).query(async ({ ctx, input }) => {
    const membership = await membershipFor(ctx.session.user.id, ctx.session.user.email);
    const settings = await getSubmissionSettings();
    const [submission] = await db.select({
      description: roundSubmissions.description, originalFilename: roundSubmissions.originalFilename,
      mimeType: roundSubmissions.mimeType, fileSize: roundSubmissions.fileSize,
      feedback: sql<string | null>`case when ${roundSubmissions.feedbackPublished} then ${roundSubmissions.feedback} else null end`,
      createdAt: roundSubmissions.createdAt, updatedAt: roundSubmissions.updatedAt,
    }).from(roundSubmissions).where(submissionWhere(membership.teamId, input.round)).limit(1);
    return { submission: submission ?? null, isSubmissionOpen: settings[input.round] };
  }),
  createUploadUrl: protectedProcedure.input(fileInput).mutation(async ({ ctx, input }) => {
    const membership = await membershipFor(ctx.session.user.id, ctx.session.user.email); requireCaptain(membership);
    await requireSubmissionOpen(input.round);
    const uploadId = crypto.randomUUID();
    const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: env.R2_BUCKET,
      Key: objectKey(input.round, membership.teamId, uploadId, validateFile(input)), ContentType: input.mimeType,
      ContentLength: input.fileSize }), { expiresIn: URL_EXPIRY_SECONDS });
    return { uploadId, uploadUrl, expiresIn: URL_EXPIRY_SECONDS };
  }),
  finalize: protectedProcedure.input(fileInput.extend({ uploadId: z.uuid(), description: z.string().trim().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const membership = await membershipFor(ctx.session.user.id, ctx.session.user.email); requireCaptain(membership);
      const key = objectKey(input.round, membership.teamId, input.uploadId, validateFile(input));
      try { await requireSubmissionOpen(input.round); } catch (error) {
        const [current] = await db.select({ objectKey: roundSubmissions.objectKey }).from(roundSubmissions)
          .where(submissionWhere(membership.teamId, input.round)).limit(1);
        if (current?.objectKey !== key) await bestEffortDelete(key); throw error;
      }
      let object;
      try { object = await s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key })); }
      catch { throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_NOT_FOUND" }); }
      if (object.ContentLength !== input.fileSize || object.ContentType !== input.mimeType) {
        await bestEffortDelete(key); throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_MISMATCH" });
      }
      const [previous] = await db.select({ objectKey: roundSubmissions.objectKey }).from(roundSubmissions)
        .where(submissionWhere(membership.teamId, input.round)).limit(1);
      try {
        await db.insert(roundSubmissions).values({ teamId: membership.teamId, round: input.round, description: input.description,
          objectKey: key, originalFilename: input.filename, mimeType: input.mimeType, fileSize: input.fileSize })
          .onConflictDoUpdate({ target: [roundSubmissions.teamId, roundSubmissions.round], set: {
            description: input.description, objectKey: key, originalFilename: input.filename, mimeType: input.mimeType,
            fileSize: input.fileSize, feedback: null, feedbackPublished: false, updatedAt: new Date(),
          }});
      } catch (error) { await bestEffortDelete(key); throw error; }
      if (previous?.objectKey && previous.objectKey !== key) await bestEffortDelete(previous.objectKey);
      return { success: true };
    }),
  createDownloadUrl: protectedProcedure.input(roundInput).mutation(async ({ ctx, input }) => {
    const membership = await membershipFor(ctx.session.user.id, ctx.session.user.email);
    const [submission] = await db.select({ objectKey: roundSubmissions.objectKey, filename: roundSubmissions.originalFilename })
      .from(roundSubmissions).where(submissionWhere(membership.teamId, input.round)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "SUBMISSION_NOT_FOUND" });
    const safeFilename = submission.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
    return { downloadUrl: await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"` }), { expiresIn: URL_EXPIRY_SECONDS }) };
  }),
  createPreviewUrl: protectedProcedure.input(roundInput).mutation(async ({ ctx, input }) => {
    const membership = await membershipFor(ctx.session.user.id, ctx.session.user.email);
    const [submission] = await db.select({ objectKey: roundSubmissions.objectKey, mimeType: roundSubmissions.mimeType })
      .from(roundSubmissions).where(submissionWhere(membership.teamId, input.round)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "SUBMISSION_NOT_FOUND" });
    const sourceUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentType: submission.mimeType, ResponseContentDisposition: "inline" }), { expiresIn: URL_EXPIRY_SECONDS });
    return { previewUrl: submission.mimeType === "application/pdf" ? sourceUrl : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}` };
  }),
});
