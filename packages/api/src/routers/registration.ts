import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@masc-landing/db";
import { members, teams } from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, router } from "../index";
import { createTeamInputSchema, cvFileSchema, uploadedCvSchema } from "../registration-schema";

export { createTeamInputSchema } from "../registration-schema";

const URL_EXPIRY_SECONDS = 300;
const cvUploadBatchSchema = z.object({
  uploadBatchId: z.uuid(),
  files: z.array(uploadedCvSchema).length(3),
});
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

function validateCvFilename(filename: string) {
  if (!filename.toLowerCase().endsWith(".pdf")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "UNSUPPORTED_CV_FILE" });
  }
}

function cvObjectKey(userId: string, uploadBatchId: string, uploadId: string) {
  return `registration-cvs/${encodeURIComponent(userId)}/${uploadBatchId}/${uploadId}.pdf`;
}

async function bestEffortDeleteCvObjects(userId: string, input: z.infer<typeof cvUploadBatchSchema>) {
  await Promise.allSettled(input.files.map((file) => s3.send(new DeleteObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: cvObjectKey(userId, input.uploadBatchId, file.uploadId),
  }))));
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
        cvOriginalFilename: members.cvOriginalFilename,
        cvMimeType: members.cvMimeType,
        cvFileSize: members.cvFileSize,
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

  createCvUploadUrls: protectedProcedure.input(z.object({ files: z.array(cvFileSchema).length(3) }))
    .mutation(async ({ ctx, input }) => {
      input.files.forEach((file) => validateCvFilename(file.filename));
      const uploadBatchId = crypto.randomUUID();
      const uploads = await Promise.all(input.files.map(async (file) => {
        const uploadId = crypto.randomUUID();
        const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: cvObjectKey(ctx.session.user.id, uploadBatchId, uploadId),
          ContentType: file.mimeType,
          ContentLength: file.fileSize,
        }), { expiresIn: URL_EXPIRY_SECONDS });
        return { uploadId, uploadUrl };
      }));
      return { uploadBatchId, uploads, expiresIn: URL_EXPIRY_SECONDS };
    }),

  discardCvUploads: protectedProcedure.input(cvUploadBatchSchema).mutation(async ({ ctx, input }) => {
    await bestEffortDeleteCvObjects(ctx.session.user.id, input);
    return { success: true };
  }),

  createTeam: protectedProcedure.input(createTeamInputSchema).mutation(async ({ ctx, input }) => {
    const captainEmail = ctx.session.user.email.trim().toLowerCase();
    const allEmails = [captainEmail, ...input.teammates.map((member) => member.email)];

    const uploadedFiles = [input.captainCv, ...input.teammates.map((member) => member.cv)];
    const uploadBatch = { uploadBatchId: input.uploadBatchId, files: uploadedFiles };
    uploadedFiles.forEach((file) => validateCvFilename(file.filename));

    if (new Set(allEmails).size !== allEmails.length) {
      await bestEffortDeleteCvObjects(ctx.session.user.id, uploadBatch);
      throw new TRPCError({ code: "BAD_REQUEST", message: "DUPLICATE_EMAILS" });
    }

    const existingMembers = await db
      .select({ email: members.email })
      .from(members)
      .where(inArray(sql<string>`lower(${members.email})`, allEmails))
      .limit(1);

    if (existingMembers.length > 0) {
      await bestEffortDeleteCvObjects(ctx.session.user.id, uploadBatch);
      throw new TRPCError({ code: "CONFLICT", message: "EMAIL_ALREADY_REGISTERED" });
    }

    try {
      const objects = await Promise.all(uploadedFiles.map((file) => s3.send(new HeadObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: cvObjectKey(ctx.session.user.id, input.uploadBatchId, file.uploadId),
      }))));
      if (objects.some((object, index) => object.ContentLength !== uploadedFiles[index]!.fileSize
        || object.ContentType !== uploadedFiles[index]!.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CV_UPLOAD_MISMATCH" });
      }
    } catch (error) {
      await bestEffortDeleteCvObjects(ctx.session.user.id, uploadBatch);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: "BAD_REQUEST", message: "CV_UPLOAD_NOT_FOUND" });
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
        cvObjectKey: cvObjectKey(ctx.session.user.id, input.uploadBatchId, input.captainCv.uploadId),
        cvOriginalFilename: input.captainCv.filename,
        cvMimeType: input.captainCv.mimeType,
        cvFileSize: input.captainCv.fileSize,
      },
      ...input.teammates.map(({ cv, ...member }) => ({
        id: crypto.randomUUID(),
        teamId,
        isCaptain: false,
        ...member,
        cvObjectKey: cvObjectKey(ctx.session.user.id, input.uploadBatchId, cv.uploadId),
        cvOriginalFilename: cv.filename,
        cvMimeType: cv.mimeType,
        cvFileSize: cv.fileSize,
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
      await bestEffortDeleteCvObjects(ctx.session.user.id, uploadBatch);
      if (isUniqueViolation(error)) {
        throw new TRPCError({ code: "CONFLICT", message: "EMAIL_ALREADY_REGISTERED" });
      }
      throw error;
    }

    return { teamId };
  }),

  createCvPreviewUrl: protectedProcedure.input(z.object({ memberId: z.string().trim().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const email = ctx.session.user.email.trim().toLowerCase();
      const [membership] = await db.select({ teamId: members.teamId })
        .from(members)
        .innerJoin(teams, eq(members.teamId, teams.id))
        .where(or(
          and(eq(teams.captainId, ctx.session.user.id), eq(members.isCaptain, true)),
          sql`lower(${members.email}) = ${email}`,
        )).limit(1);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "TEAM_REQUIRED" });
      const [requested] = await db.select({ objectKey: members.cvObjectKey })
        .from(members)
        .where(and(eq(members.id, input.memberId), eq(members.teamId, membership.teamId))).limit(1);
      if (!requested) throw new TRPCError({ code: "NOT_FOUND", message: "CV_NOT_FOUND" });
      return { previewUrl: await getSignedUrl(s3, new GetObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: requested.objectKey,
        ResponseContentType: "application/pdf",
        ResponseContentDisposition: "inline",
      }), { expiresIn: URL_EXPIRY_SECONDS }) };
    }),
});
