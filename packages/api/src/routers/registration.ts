import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@masc-landing/db";
import {
  members,
  roundOneMemberCvs,
  roundOneMembers,
  roundOneTeams,
  teams,
} from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getAdmissionSettings, requireAdmissionOpen } from "../admission-settings";
import { freshProtectedProcedure, protectedProcedure, router } from "../index";
import { getRoundMembership, getRoundMemberships } from "../registration-memberships";
import { roundSchema } from "../rounds";
import { awarenessSourcesRequiringDetail, createTeamInputSchema } from "../registration-schema";

export { createTeamInputSchema } from "../registration-schema";

const CV_MAX_FILE_SIZE = 10 * 1024 * 1024;
const URL_EXPIRY_SECONDS = 300;
const cvFileSchema = z.object({
  uploadId: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.literal("application/pdf"),
  fileSize: z.number().int().positive().max(CV_MAX_FILE_SIZE),
});
const createRoundOneTeamInputSchema = createTeamInputSchema.extend({ cvs: z.array(cvFileSchema).length(3) });

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

function isUniqueViolation(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

function cvObjectKey(userId: string, uploadId: string) {
  return `round-1-cvs/${userId}/${uploadId}.pdf`;
}

function validateCvFilename(filename: string) {
  if (!filename.toLowerCase().endsWith(".pdf")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "UNSUPPORTED_FILE" });
  }
}

async function bestEffortDelete(keys: string[]) {
  await Promise.all(keys.map(async (key) => {
    try { await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key })); } catch { /* lifecycle cleanup handles abandoned files */ }
  }));
}

const createRoundHalfTeam = freshProtectedProcedure.input(createTeamInputSchema).mutation(async ({ ctx, input }) => {
  await requireAdmissionOpen("0.5");
  const captainEmail = ctx.session.user.email.trim().toLowerCase();
  const allEmails = [captainEmail, ...input.teammates.map((member) => member.email)];
  if (new Set(allEmails).size !== allEmails.length) throw new TRPCError({ code: "BAD_REQUEST", message: "DUPLICATE_EMAILS" });
  const existingMembers = await db.select({ email: members.email }).from(members)
    .where(inArray(sql<string>`lower(${members.email})`, allEmails)).limit(1);
  if (existingMembers.length) throw new TRPCError({ code: "CONFLICT", message: "EMAIL_ALREADY_REGISTERED" });
  const teamId = crypto.randomUUID();
  const roster = [{ id: crypto.randomUUID(), teamId, isCaptain: true, fullName: input.captainFullName,
    email: captainEmail, birthdate: input.captainBirthdate, universityName: input.captainUniversityName },
    ...input.teammates.map((member) => ({ id: crypto.randomUUID(), teamId, isCaptain: false, ...member }))];
  try {
    await db.batch([db.insert(teams).values({ id: teamId, teamName: input.teamName, captainId: ctx.session.user.id,
      captainPhone: input.captainPhone, awarenessSource: input.awarenessSource,
      awarenessSourceDetail: awarenessSourcesRequiringDetail.includes(input.awarenessSource) ? input.awarenessSourceDetail : null }),
    db.insert(members).values(roster)]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "EMAIL_ALREADY_REGISTERED" });
    throw error;
  }
  return { teamId };
});

export const registrationRouter = router({
  settings: protectedProcedure.query(getAdmissionSettings),
  memberships: protectedProcedure.query(async ({ ctx }) => {
    const user = { id: ctx.session.user.id, email: ctx.session.user.email };
    return getRoundMemberships(user);
  }),
  current: protectedProcedure.input(z.object({ round: roundSchema })).query(async ({ ctx, input }) => {
    const user = { id: ctx.session.user.id, email: ctx.session.user.email };
    return getRoundMembership(user, input.round);
  }),
  createRoundHalfTeam,
  createTeam: createRoundHalfTeam,
  createRoundOneCvUploadUrl: freshProtectedProcedure.input(cvFileSchema.omit({ uploadId: true })).mutation(async ({ ctx, input }) => {
    await requireAdmissionOpen("1"); validateCvFilename(input.filename);
    const uploadId = crypto.randomUUID();
    const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: env.R2_BUCKET,
      Key: cvObjectKey(ctx.session.user.id, uploadId), ContentType: input.mimeType, ContentLength: input.fileSize }),
    { expiresIn: URL_EXPIRY_SECONDS });
    return { uploadId, uploadUrl, expiresIn: URL_EXPIRY_SECONDS };
  }),
  createRoundOneTeam: freshProtectedProcedure.input(createRoundOneTeamInputSchema).mutation(async ({ ctx, input }) => {
    await requireAdmissionOpen("1"); input.cvs.forEach((cv) => validateCvFilename(cv.filename));
    const keys = input.cvs.map((cv) => cvObjectKey(ctx.session.user.id, cv.uploadId));
    const captainEmail = ctx.session.user.email.trim().toLowerCase();
    const allEmails = [captainEmail, ...input.teammates.map((member) => member.email)];
    if (new Set(allEmails).size !== allEmails.length) {
      await bestEffortDelete(keys);
      throw new TRPCError({ code: "BAD_REQUEST", message: "DUPLICATE_EMAILS" });
    }
    const existing = await db.select({ email: roundOneMembers.email }).from(roundOneMembers)
      .where(inArray(sql<string>`lower(${roundOneMembers.email})`, allEmails)).limit(1);
    if (existing.length) {
      await bestEffortDelete(keys);
      throw new TRPCError({ code: "CONFLICT", message: "EMAIL_ALREADY_REGISTERED" });
    }
    try {
      const objects = await Promise.all(keys.map((Key) => s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key }))));
      objects.forEach((object, index) => {
        const cv = input.cvs[index]!;
        if (object.ContentLength !== cv.fileSize || object.ContentType !== cv.mimeType) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_MISMATCH" });
        }
      });
    } catch (error) {
      await bestEffortDelete(keys);
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_NOT_FOUND" });
    }
    const teamId = crypto.randomUUID();
    const roster = [{ id: crypto.randomUUID(), teamId, isCaptain: true, fullName: input.captainFullName,
      email: captainEmail, birthdate: input.captainBirthdate, universityName: input.captainUniversityName },
      ...input.teammates.map((member) => ({ id: crypto.randomUUID(), teamId, isCaptain: false, ...member }))];
    try {
      await db.batch([
        db.insert(roundOneTeams).values({ id: teamId, teamName: input.teamName, captainId: ctx.session.user.id,
          captainPhone: input.captainPhone, awarenessSource: input.awarenessSource, admissionMethod: "cv_screening",
          awarenessSourceDetail: awarenessSourcesRequiringDetail.includes(input.awarenessSource) ? input.awarenessSourceDetail : null }),
        db.insert(roundOneMembers).values(roster),
        db.insert(roundOneMemberCvs).values(roster.map((member, index) => ({ memberId: member.id,
          objectKey: keys[index]!, originalFilename: input.cvs[index]!.filename,
          mimeType: input.cvs[index]!.mimeType, fileSize: input.cvs[index]!.fileSize }))),
      ]);
    } catch (error) {
      await bestEffortDelete(keys);
      if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "EMAIL_ALREADY_REGISTERED" });
      throw error;
    }
    return { teamId };
  }),
  createRoundOneCvDownloadUrl: freshProtectedProcedure.input(z.object({ memberId: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const [cv] = await db.select({ objectKey: roundOneMemberCvs.objectKey,
        filename: roundOneMemberCvs.originalFilename }).from(roundOneMemberCvs)
        .innerJoin(roundOneMembers, eq(roundOneMemberCvs.memberId, roundOneMembers.id))
        .innerJoin(roundOneTeams, eq(roundOneMembers.teamId, roundOneTeams.id))
        .where(and(eq(roundOneMemberCvs.memberId, input.memberId), eq(roundOneTeams.captainId, ctx.session.user.id))).limit(1);
      if (!cv) throw new TRPCError({ code: "FORBIDDEN", message: "CV_ACCESS_DENIED" });
      const safeFilename = cv.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
      return { downloadUrl: await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: cv.objectKey,
        ResponseContentDisposition: `attachment; filename="${safeFilename}"` }), { expiresIn: URL_EXPIRY_SECONDS }) };
    }),
});
