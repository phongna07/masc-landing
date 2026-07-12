import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "@masc-landing/auth";
import { db } from "@masc-landing/db";
import { members, roundSubmissions, submissionSettings, teams, user } from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { roundSchema } from "../rounds";
import { getSubmissionSettings } from "../submission-settings";

const userBatchSize = 100;
const signedUrlExpirySeconds = 300;
const roundInput = z.object({ round: roundSchema });
const submissionInput = roundInput.extend({ submissionId: z.string().trim().min(1).max(128) });
const feedbackInput = submissionInput.extend({ feedback: z.string().trim().min(1).max(5000) });

const s3 = new S3Client({ region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });

function identifiedSubmission(input: z.infer<typeof submissionInput>) {
  return and(eq(roundSubmissions.id, input.submissionId), eq(roundSubmissions.round, input.round));
}
async function findSubmissionFile(input: z.infer<typeof submissionInput>) {
  const [submission] = await db.select({ objectKey: roundSubmissions.objectKey, filename: roundSubmissions.originalFilename,
    mimeType: roundSubmissions.mimeType }).from(roundSubmissions).where(identifiedSubmission(input)).limit(1);
  if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
  return submission;
}

export const adminRouter = router({
  getSubmissionSettings: adminProcedure.query(getSubmissionSettings),
  setRoundSubmissionOpen: adminProcedure.input(roundInput.extend({ isOpen: z.boolean() })).mutation(async ({ input }) => {
    await db.insert(submissionSettings).values({ round: input.round, isOpen: input.isOpen, updatedAt: new Date() })
      .onConflictDoUpdate({ target: submissionSettings.round, set: { isOpen: input.isOpen, updatedAt: new Date() } });
    return getSubmissionSettings();
  }),
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const allUsers = []; let offset = 0; let total = 0;
    do {
      const result = await auth.api.listUsers({ headers: ctx.headers, query: { limit: userBatchSize, offset,
        sortBy: "createdAt", sortDirection: "desc" } });
      allUsers.push(...result.users); total = result.total; offset += result.users.length;
    } while (offset < total && offset > 0);
    return allUsers.map((item) => ({ id: item.id, name: item.name, email: item.email,
      emailVerified: item.emailVerified, image: item.image, role: item.role, banned: item.banned,
      banReason: item.banReason, banExpires: item.banExpires, createdAt: item.createdAt, updatedAt: item.updatedAt }));
  }),
  listTeams: adminProcedure.query(async () => db.select({ id: teams.id, name: teams.teamName,
    status: teams.registrationStatus, createdAt: teams.createdAt, captainName: user.name, captainEmail: user.email,
    captainPhone: teams.captainPhone, memberCount: count(members.id) }).from(teams)
    .innerJoin(user, eq(teams.captainId, user.id)).leftJoin(members, eq(teams.id, members.teamId))
    .groupBy(teams.id, user.id).orderBy(desc(teams.createdAt), asc(teams.teamName))),
  getTeam: adminProcedure.input(z.object({ teamId: z.string().trim().min(1).max(128) })).query(async ({ input }) => {
    const [team] = await db.select({ id: teams.id, name: teams.teamName, status: teams.registrationStatus,
      createdAt: teams.createdAt, captainName: user.name, captainEmail: user.email, captainPhone: teams.captainPhone })
      .from(teams).innerJoin(user, eq(teams.captainId, user.id)).where(eq(teams.id, input.teamId)).limit(1);
    if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
    const roster = await db.select({ id: members.id, fullName: members.fullName, email: members.email,
      universityName: members.universityName, isCaptain: members.isCaptain }).from(members)
      .where(eq(members.teamId, team.id)).orderBy(desc(members.isCaptain), asc(members.fullName));
    return { ...team, members: roster };
  }),
  listRoundSubmissions: adminProcedure.input(roundInput).query(async ({ input }) => db.select({
    id: roundSubmissions.id, teamId: teams.id, teamName: teams.teamName, teamStatus: teams.registrationStatus,
    captainName: user.name, captainEmail: user.email, originalFilename: roundSubmissions.originalFilename,
    mimeType: roundSubmissions.mimeType, fileSize: roundSubmissions.fileSize, createdAt: roundSubmissions.createdAt,
    updatedAt: roundSubmissions.updatedAt,
  }).from(roundSubmissions).innerJoin(teams, eq(roundSubmissions.teamId, teams.id))
    .innerJoin(user, eq(teams.captainId, user.id)).where(eq(roundSubmissions.round, input.round))
    .orderBy(desc(roundSubmissions.updatedAt), asc(teams.teamName))),
  getRoundSubmission: adminProcedure.input(submissionInput).query(async ({ input }) => {
    const [submission] = await db.select({ id: roundSubmissions.id, description: roundSubmissions.description,
      feedback: roundSubmissions.feedback, feedbackPublished: roundSubmissions.feedbackPublished,
      originalFilename: roundSubmissions.originalFilename, mimeType: roundSubmissions.mimeType,
      fileSize: roundSubmissions.fileSize, createdAt: roundSubmissions.createdAt, updatedAt: roundSubmissions.updatedAt,
      teamId: teams.id, teamName: teams.teamName, teamStatus: teams.registrationStatus, teamCreatedAt: teams.createdAt,
      captainName: user.name, captainEmail: user.email, captainPhone: teams.captainPhone,
    }).from(roundSubmissions).innerJoin(teams, eq(roundSubmissions.teamId, teams.id))
      .innerJoin(user, eq(teams.captainId, user.id)).where(identifiedSubmission(input)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    const roster = await db.select({ id: members.id, fullName: members.fullName, email: members.email,
      universityName: members.universityName, isCaptain: members.isCaptain }).from(members)
      .where(eq(members.teamId, submission.teamId)).orderBy(desc(members.isCaptain), asc(members.fullName));
    return { ...submission, members: roster };
  }),
  saveRoundFeedbackDraft: adminProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const [submission] = await db.update(roundSubmissions).set({ feedback: input.feedback, feedbackPublished: false })
      .where(identifiedSubmission(input)).returning({ id: roundSubmissions.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" }); return { success: true };
  }),
  publishRoundFeedback: adminProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const [submission] = await db.update(roundSubmissions).set({ feedback: input.feedback, feedbackPublished: true })
      .where(identifiedSubmission(input)).returning({ id: roundSubmissions.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" }); return { success: true };
  }),
  createRoundDownloadUrl: adminProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findSubmissionFile(input); const safeFilename = submission.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
    return { downloadUrl: await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"` }), { expiresIn: signedUrlExpirySeconds }) };
  }),
  createRoundPreviewUrl: adminProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findSubmissionFile(input);
    const sourceUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentType: submission.mimeType, ResponseContentDisposition: "inline" }), { expiresIn: signedUrlExpirySeconds });
    return { previewUrl: submission.mimeType === "application/pdf" ? sourceUrl : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}` };
  }),
});
