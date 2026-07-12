import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "@masc-landing/auth";
import { db } from "@masc-landing/db";
import {
  members,
  roundOneSubmissions,
  roundThreeSubmissions,
  roundTwoSubmissions,
  teams,
  user,
} from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, router } from "../index";

const userBatchSize = 100;
const signedUrlExpirySeconds = 300;
const submissionInput = z.object({ submissionId: z.string().trim().min(1).max(128) });
const feedbackInput = submissionInput.extend({ feedback: z.string().trim().min(1).max(5000) });

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

async function findSubmissionFile(submissionId: string) {
  const [submission] = await db.select({
    objectKey: roundOneSubmissions.objectKey,
    filename: roundOneSubmissions.originalFilename,
    mimeType: roundOneSubmissions.mimeType,
  }).from(roundOneSubmissions).where(eq(roundOneSubmissions.id, submissionId)).limit(1);
  if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
  return submission;
}

async function findRoundTwoSubmissionFile(submissionId: string) {
  const [submission] = await db.select({
    objectKey: roundTwoSubmissions.objectKey,
    filename: roundTwoSubmissions.originalFilename,
    mimeType: roundTwoSubmissions.mimeType,
  }).from(roundTwoSubmissions).where(eq(roundTwoSubmissions.id, submissionId)).limit(1);
  if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
  return submission;
}

async function findRoundThreeSubmissionFile(submissionId: string) {
  const [submission] = await db.select({
    objectKey: roundThreeSubmissions.objectKey,
    filename: roundThreeSubmissions.originalFilename,
    mimeType: roundThreeSubmissions.mimeType,
  }).from(roundThreeSubmissions).where(eq(roundThreeSubmissions.id, submissionId)).limit(1);
  if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
  return submission;
}

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

  listRoundOneSubmissions: adminProcedure.query(async () => {
    return db.select({
      id: roundOneSubmissions.id,
      teamId: teams.id,
      teamName: teams.teamName,
      teamStatus: teams.registrationStatus,
      captainName: user.name,
      captainEmail: user.email,
      originalFilename: roundOneSubmissions.originalFilename,
      mimeType: roundOneSubmissions.mimeType,
      fileSize: roundOneSubmissions.fileSize,
      createdAt: roundOneSubmissions.createdAt,
      updatedAt: roundOneSubmissions.updatedAt,
    }).from(roundOneSubmissions)
      .innerJoin(teams, eq(roundOneSubmissions.teamId, teams.id))
      .innerJoin(user, eq(teams.captainId, user.id))
      .orderBy(desc(roundOneSubmissions.updatedAt), asc(teams.teamName));
  }),

  getRoundOneSubmission: adminProcedure.input(submissionInput).query(async ({ input }) => {
    const [submission] = await db.select({
      id: roundOneSubmissions.id,
      description: roundOneSubmissions.description,
      feedback: roundOneSubmissions.feedback,
      feedbackPublished: roundOneSubmissions.feedbackPublished,
      originalFilename: roundOneSubmissions.originalFilename,
      mimeType: roundOneSubmissions.mimeType,
      fileSize: roundOneSubmissions.fileSize,
      createdAt: roundOneSubmissions.createdAt,
      updatedAt: roundOneSubmissions.updatedAt,
      teamId: teams.id,
      teamName: teams.teamName,
      teamStatus: teams.registrationStatus,
      teamCreatedAt: teams.createdAt,
      captainName: user.name,
      captainEmail: user.email,
      captainPhone: teams.captainPhone,
    }).from(roundOneSubmissions)
      .innerJoin(teams, eq(roundOneSubmissions.teamId, teams.id))
      .innerJoin(user, eq(teams.captainId, user.id))
      .where(eq(roundOneSubmissions.id, input.submissionId)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });

    const roster = await db.select({
      id: members.id,
      fullName: members.fullName,
      email: members.email,
      universityName: members.universityName,
      isCaptain: members.isCaptain,
    }).from(members).where(eq(members.teamId, submission.teamId))
      .orderBy(desc(members.isCaptain), asc(members.fullName));
    return { ...submission, members: roster };
  }),

  saveRoundOneFeedbackDraft: adminProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const [submission] = await db.update(roundOneSubmissions).set({
      feedback: input.feedback,
      feedbackPublished: false,
    }).where(eq(roundOneSubmissions.id, input.submissionId)).returning({ id: roundOneSubmissions.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    return { success: true };
  }),

  publishRoundOneFeedback: adminProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const [submission] = await db.update(roundOneSubmissions).set({
      feedback: input.feedback,
      feedbackPublished: true,
    }).where(eq(roundOneSubmissions.id, input.submissionId)).returning({ id: roundOneSubmissions.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    return { success: true };
  }),

  createRoundOneDownloadUrl: adminProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findSubmissionFile(input.submissionId);
    const safeFilename = submission.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
    const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: submission.objectKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
    }), { expiresIn: signedUrlExpirySeconds });
    return { downloadUrl };
  }),

  createRoundOnePreviewUrl: adminProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findSubmissionFile(input.submissionId);
    const sourceUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: submission.objectKey,
      ResponseContentType: submission.mimeType,
      ResponseContentDisposition: "inline",
    }), { expiresIn: signedUrlExpirySeconds });
    return {
      previewUrl: submission.mimeType === "application/pdf"
        ? sourceUrl
        : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}`,
    };
  }),
  listRoundTwoSubmissions: adminProcedure.query(async () => {
    return db.select({
      id: roundTwoSubmissions.id,
      teamId: teams.id,
      teamName: teams.teamName,
      teamStatus: teams.registrationStatus,
      captainName: user.name,
      captainEmail: user.email,
      originalFilename: roundTwoSubmissions.originalFilename,
      mimeType: roundTwoSubmissions.mimeType,
      fileSize: roundTwoSubmissions.fileSize,
      createdAt: roundTwoSubmissions.createdAt,
      updatedAt: roundTwoSubmissions.updatedAt,
    }).from(roundTwoSubmissions)
      .innerJoin(teams, eq(roundTwoSubmissions.teamId, teams.id))
      .innerJoin(user, eq(teams.captainId, user.id))
      .orderBy(desc(roundTwoSubmissions.updatedAt), asc(teams.teamName));
  }),

  getRoundTwoSubmission: adminProcedure.input(submissionInput).query(async ({ input }) => {
    const [submission] = await db.select({
      id: roundTwoSubmissions.id,
      description: roundTwoSubmissions.description,
      feedback: roundTwoSubmissions.feedback,
      feedbackPublished: roundTwoSubmissions.feedbackPublished,
      originalFilename: roundTwoSubmissions.originalFilename,
      mimeType: roundTwoSubmissions.mimeType,
      fileSize: roundTwoSubmissions.fileSize,
      createdAt: roundTwoSubmissions.createdAt,
      updatedAt: roundTwoSubmissions.updatedAt,
      teamId: teams.id,
      teamName: teams.teamName,
      teamStatus: teams.registrationStatus,
      teamCreatedAt: teams.createdAt,
      captainName: user.name,
      captainEmail: user.email,
      captainPhone: teams.captainPhone,
    }).from(roundTwoSubmissions)
      .innerJoin(teams, eq(roundTwoSubmissions.teamId, teams.id))
      .innerJoin(user, eq(teams.captainId, user.id))
      .where(eq(roundTwoSubmissions.id, input.submissionId)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });

    const roster = await db.select({
      id: members.id,
      fullName: members.fullName,
      email: members.email,
      universityName: members.universityName,
      isCaptain: members.isCaptain,
    }).from(members).where(eq(members.teamId, submission.teamId))
      .orderBy(desc(members.isCaptain), asc(members.fullName));
    return { ...submission, members: roster };
  }),

  saveRoundTwoFeedbackDraft: adminProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const [submission] = await db.update(roundTwoSubmissions).set({
      feedback: input.feedback,
      feedbackPublished: false,
    }).where(eq(roundTwoSubmissions.id, input.submissionId)).returning({ id: roundTwoSubmissions.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    return { success: true };
  }),

  publishRoundTwoFeedback: adminProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const [submission] = await db.update(roundTwoSubmissions).set({
      feedback: input.feedback,
      feedbackPublished: true,
    }).where(eq(roundTwoSubmissions.id, input.submissionId)).returning({ id: roundTwoSubmissions.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    return { success: true };
  }),

  createRoundTwoDownloadUrl: adminProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findRoundTwoSubmissionFile(input.submissionId);
    const safeFilename = submission.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
    const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: submission.objectKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
    }), { expiresIn: signedUrlExpirySeconds });
    return { downloadUrl };
  }),

  createRoundTwoPreviewUrl: adminProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findRoundTwoSubmissionFile(input.submissionId);
    const sourceUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: submission.objectKey,
      ResponseContentType: submission.mimeType,
      ResponseContentDisposition: "inline",
    }), { expiresIn: signedUrlExpirySeconds });
    return {
      previewUrl: submission.mimeType === "application/pdf"
        ? sourceUrl
        : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}`,
    };
  }),

  listRoundThreeSubmissions: adminProcedure.query(async () => {
    return db.select({
      id: roundThreeSubmissions.id,
      teamId: teams.id,
      teamName: teams.teamName,
      teamStatus: teams.registrationStatus,
      captainName: user.name,
      captainEmail: user.email,
      originalFilename: roundThreeSubmissions.originalFilename,
      mimeType: roundThreeSubmissions.mimeType,
      fileSize: roundThreeSubmissions.fileSize,
      createdAt: roundThreeSubmissions.createdAt,
      updatedAt: roundThreeSubmissions.updatedAt,
    }).from(roundThreeSubmissions)
      .innerJoin(teams, eq(roundThreeSubmissions.teamId, teams.id))
      .innerJoin(user, eq(teams.captainId, user.id))
      .orderBy(desc(roundThreeSubmissions.updatedAt), asc(teams.teamName));
  }),

  getRoundThreeSubmission: adminProcedure.input(submissionInput).query(async ({ input }) => {
    const [submission] = await db.select({
      id: roundThreeSubmissions.id,
      description: roundThreeSubmissions.description,
      feedback: roundThreeSubmissions.feedback,
      feedbackPublished: roundThreeSubmissions.feedbackPublished,
      originalFilename: roundThreeSubmissions.originalFilename,
      mimeType: roundThreeSubmissions.mimeType,
      fileSize: roundThreeSubmissions.fileSize,
      createdAt: roundThreeSubmissions.createdAt,
      updatedAt: roundThreeSubmissions.updatedAt,
      teamId: teams.id,
      teamName: teams.teamName,
      teamStatus: teams.registrationStatus,
      teamCreatedAt: teams.createdAt,
      captainName: user.name,
      captainEmail: user.email,
      captainPhone: teams.captainPhone,
    }).from(roundThreeSubmissions)
      .innerJoin(teams, eq(roundThreeSubmissions.teamId, teams.id))
      .innerJoin(user, eq(teams.captainId, user.id))
      .where(eq(roundThreeSubmissions.id, input.submissionId)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });

    const roster = await db.select({
      id: members.id,
      fullName: members.fullName,
      email: members.email,
      universityName: members.universityName,
      isCaptain: members.isCaptain,
    }).from(members).where(eq(members.teamId, submission.teamId))
      .orderBy(desc(members.isCaptain), asc(members.fullName));
    return { ...submission, members: roster };
  }),

  saveRoundThreeFeedbackDraft: adminProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const [submission] = await db.update(roundThreeSubmissions).set({
      feedback: input.feedback,
      feedbackPublished: false,
    }).where(eq(roundThreeSubmissions.id, input.submissionId)).returning({ id: roundThreeSubmissions.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    return { success: true };
  }),

  publishRoundThreeFeedback: adminProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const [submission] = await db.update(roundThreeSubmissions).set({
      feedback: input.feedback,
      feedbackPublished: true,
    }).where(eq(roundThreeSubmissions.id, input.submissionId)).returning({ id: roundThreeSubmissions.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    return { success: true };
  }),

  createRoundThreeDownloadUrl: adminProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findRoundThreeSubmissionFile(input.submissionId);
    const safeFilename = submission.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
    const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: submission.objectKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
    }), { expiresIn: signedUrlExpirySeconds });
    return { downloadUrl };
  }),

  createRoundThreePreviewUrl: adminProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findRoundThreeSubmissionFile(input.submissionId);
    const sourceUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: submission.objectKey,
      ResponseContentType: submission.mimeType,
      ResponseContentDisposition: "inline",
    }), { expiresIn: signedUrlExpirySeconds });
    return {
      previewUrl: submission.mimeType === "application/pdf"
        ? sourceUrl
        : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}`,
    };
  }),
});
