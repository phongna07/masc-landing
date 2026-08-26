import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@masc-landing/db";
import { preferencesSettings, roundOneMembers, roundOneTeams } from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";

import { adminAreaProcedure, freshProtectedProcedure, router } from "../index";
import { MAX_PROBLEM_STATEMENT_FILE_SIZE } from "../round-one-problem-statements";
import { attachmentContentDisposition } from "../submission-files";

const URL_EXPIRY_SECONDS = 300;
const PDF_MIME_TYPE = "application/pdf";
const overviewProcedure = adminAreaProcedure("overview");
const trackIdSchema = z.string().trim().min(1).max(128);
const fileInput = z.object({
  trackId: trackIdSchema,
  filename: z.string().trim().min(1).max(255),
  mimeType: z.literal(PDF_MIME_TYPE),
  fileSize: z.number().int().positive().max(MAX_PROBLEM_STATEMENT_FILE_SIZE),
});
const uploadedFileInput = fileInput.extend({ uploadId: z.uuid() });

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

function validatePdfFilename(filename: string) {
  if (!filename.toLowerCase().endsWith(".pdf")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "UNSUPPORTED_FILE" });
  }
}

function objectKey(trackId: string, uploadId: string) {
  return `round-1-problem-statements/${trackId}/${uploadId}.pdf`;
}

async function bestEffortDelete(key: string) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  } catch {
    // Persisted track settings must survive R2 cleanup failures.
  }
}

async function requireTrack(trackId: string) {
  const [track] = await db.select({ id: preferencesSettings.id })
    .from(preferencesSettings)
    .where(eq(preferencesSettings.id, trackId))
    .limit(1);
  if (!track) throw new TRPCError({ code: "NOT_FOUND", message: "PREFERENCE_SETTING_NOT_FOUND" });
}

async function assignedProblemStatementFor(user: { id: string; email: string }) {
  const normalizedEmail = user.email.trim().toLowerCase();
  const [assignedTrack] = await db.select({
    objectKey: preferencesSettings.problemStatementObjectKey,
    originalFilename: preferencesSettings.problemStatementOriginalFilename,
    mimeType: preferencesSettings.problemStatementMimeType,
    fileSize: preferencesSettings.problemStatementFileSize,
  }).from(roundOneMembers)
    .innerJoin(roundOneTeams, eq(roundOneMembers.teamId, roundOneTeams.id))
    .innerJoin(preferencesSettings, eq(roundOneTeams.assignedTrackId, preferencesSettings.id))
    .where(and(
      eq(roundOneTeams.preferenceStatus, "assigned"),
      or(
        and(eq(roundOneTeams.captainId, user.id), eq(roundOneMembers.isCaptain, true)),
        sql`lower(${roundOneMembers.email}) = ${normalizedEmail}`,
      ),
    ))
    .limit(1);

  if (!assignedTrack) {
    throw new TRPCError({ code: "FORBIDDEN", message: "ROUND_ONE_TRACK_NOT_ASSIGNED" });
  }
  if (
    assignedTrack.objectKey === null ||
    assignedTrack.originalFilename === null ||
    assignedTrack.mimeType !== PDF_MIME_TYPE ||
    assignedTrack.fileSize === null
  ) {
    return null;
  }
  return {
    objectKey: assignedTrack.objectKey,
    originalFilename: assignedTrack.originalFilename,
    fileSize: assignedTrack.fileSize,
  };
}

export const roundOneProblemStatementRouter = router({
  createUploadUrl: overviewProcedure.input(fileInput).mutation(async ({ input }) => {
    validatePdfFilename(input.filename);
    await requireTrack(input.trackId);
    const uploadId = crypto.randomUUID();
    const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: objectKey(input.trackId, uploadId),
      ContentType: PDF_MIME_TYPE,
      ContentLength: input.fileSize,
    }), { expiresIn: URL_EXPIRY_SECONDS });
    return { uploadId, uploadUrl, expiresIn: URL_EXPIRY_SECONDS };
  }),

  replace: overviewProcedure.input(uploadedFileInput).mutation(async ({ input }) => {
    validatePdfFilename(input.filename);
    const key = objectKey(input.trackId, input.uploadId);
    let object;
    try {
      object = await s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_NOT_FOUND" });
    }
    if (object.ContentLength !== input.fileSize || object.ContentType !== PDF_MIME_TYPE) {
      await bestEffortDelete(key);
      throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_MISMATCH" });
    }

    try {
      const [existing] = await db.select({ objectKey: preferencesSettings.problemStatementObjectKey })
        .from(preferencesSettings)
        .where(eq(preferencesSettings.id, input.trackId))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "PREFERENCE_SETTING_NOT_FOUND" });
      const [updated] = await db.update(preferencesSettings).set({
        problemStatementObjectKey: key,
        problemStatementOriginalFilename: input.filename,
        problemStatementMimeType: PDF_MIME_TYPE,
        problemStatementFileSize: input.fileSize,
        updatedAt: new Date(),
      }).where(eq(preferencesSettings.id, input.trackId)).returning({ id: preferencesSettings.id });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "PREFERENCE_SETTING_NOT_FOUND" });
      if (existing.objectKey && existing.objectKey !== key) await bestEffortDelete(existing.objectKey);
      return { success: true };
    } catch (error) {
      await bestEffortDelete(key);
      throw error;
    }
  }),

  remove: overviewProcedure.input(z.object({ trackId: trackIdSchema })).mutation(async ({ input }) => {
    const [existing] = await db.select({ objectKey: preferencesSettings.problemStatementObjectKey })
      .from(preferencesSettings)
      .where(eq(preferencesSettings.id, input.trackId))
      .limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "PREFERENCE_SETTING_NOT_FOUND" });
    const [updated] = await db.update(preferencesSettings).set({
      problemStatementObjectKey: null,
      problemStatementOriginalFilename: null,
      problemStatementMimeType: null,
      problemStatementFileSize: null,
      updatedAt: new Date(),
    }).where(eq(preferencesSettings.id, input.trackId)).returning({ id: preferencesSettings.id });
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "PREFERENCE_SETTING_NOT_FOUND" });
    if (existing.objectKey) await bestEffortDelete(existing.objectKey);
    return { success: true };
  }),

  createAdminDownloadUrl: overviewProcedure.input(z.object({ trackId: trackIdSchema })).mutation(async ({ input }) => {
    const [statement] = await db.select({
      objectKey: preferencesSettings.problemStatementObjectKey,
      originalFilename: preferencesSettings.problemStatementOriginalFilename,
    }).from(preferencesSettings)
      .where(eq(preferencesSettings.id, input.trackId))
      .limit(1);
    if (!statement) throw new TRPCError({ code: "NOT_FOUND", message: "PREFERENCE_SETTING_NOT_FOUND" });
    if (!statement.objectKey || !statement.originalFilename) {
      throw new TRPCError({ code: "NOT_FOUND", message: "PROBLEM_STATEMENT_NOT_FOUND" });
    }
    const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: statement.objectKey,
      ResponseContentType: PDF_MIME_TYPE,
      ResponseContentDisposition: attachmentContentDisposition(statement.originalFilename),
    }), { expiresIn: URL_EXPIRY_SECONDS });
    return { downloadUrl };
  }),

  current: freshProtectedProcedure.query(async ({ ctx }) => {
    const statement = await assignedProblemStatementFor({
      id: ctx.session.user.id,
      email: ctx.session.user.email,
    });
    if (!statement) return null;
    const previewUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: statement.objectKey,
      ResponseContentType: PDF_MIME_TYPE,
      ResponseContentDisposition: "inline",
    }), { expiresIn: URL_EXPIRY_SECONDS });
    return {
      originalFilename: statement.originalFilename,
      fileSize: statement.fileSize,
      previewUrl,
    };
  }),

  createDownloadUrl: freshProtectedProcedure.mutation(async ({ ctx }) => {
    const statement = await assignedProblemStatementFor({
      id: ctx.session.user.id,
      email: ctx.session.user.email,
    });
    if (!statement) throw new TRPCError({ code: "NOT_FOUND", message: "PROBLEM_STATEMENT_NOT_FOUND" });
    const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: statement.objectKey,
      ResponseContentType: PDF_MIME_TYPE,
      ResponseContentDisposition: attachmentContentDisposition(statement.originalFilename),
    }), { expiresIn: URL_EXPIRY_SECONDS });
    return { downloadUrl };
  }),
});
