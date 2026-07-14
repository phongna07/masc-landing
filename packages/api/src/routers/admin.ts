import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "@masc-landing/auth";
import { db } from "@masc-landing/db";
import { emailQueue, members, roundSubmissions, submissionSettings, teams, user } from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  renderTeamRegistrationSuccess,
  teamRegistrationSuccessEvent,
  teamRegistrationSuccessSubject,
} from "../email/team-registration-success";
import { adminProcedure, router } from "../index";
import { roundSchema } from "../rounds";
import { getSubmissionSettings } from "../submission-settings";

const userBatchSize = 100;
const signedUrlExpirySeconds = 300;
const roundInput = z.object({ round: roundSchema });
const submissionInput = roundInput.extend({ submissionId: z.string().trim().min(1).max(128) });
const feedbackInput = submissionInput.extend({ feedback: z.string().trim().min(1).max(5000) });
const registrationStatusSchema = z.enum(["pending", "approved", "rejected"]);
const mailStatusSchema = z.enum(["pending", "sent", "failed"]);
const mailListStatusSchema = z.enum(["all", "pending", "sent", "failed"]);
const mailSender = `Ban Tổ chức MASC <${env.MAIL_USERNAME}>`;

const s3 = new S3Client({ region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
const ses = new SESClient({ region: env.AWS_REGION, credentials: {
  accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
} });

function encodeSesAddress(address: string) {
  const match = address.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (!match || /^[\x00-\x7F]*$/.test(match[1]!)) return address;
  return `=?UTF-8?B?${Buffer.from(match[1]!).toString("base64")}?= <${match[2]}>`;
}

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
  updateTeamStatus: adminProcedure.input(z.object({
    teamId: z.string().trim().min(1).max(128), status: registrationStatusSchema,
  })).mutation(async ({ input }) => {
    const [existing] = await db.select({ id: teams.id, name: teams.teamName, status: teams.registrationStatus,
      approvalSequence: teams.approvalSequence }).from(teams).where(eq(teams.id, input.teamId)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });

    if (input.status === "approved" && existing.status !== "approved") {
      const roster = await db.select({ id: members.id, fullName: members.fullName, email: members.email,
        universityName: members.universityName }).from(members).where(eq(members.teamId, existing.id))
        .orderBy(desc(members.isCaptain), asc(members.fullName));
      const content = renderTeamRegistrationSuccess(existing.name, roster);
      const nextSequence = existing.approvalSequence + 1;
      const queueRecords = roster.map((member) => ({ id: crypto.randomUUID(), from_address: mailSender,
        to_address: member.email, subject: teamRegistrationSuccessSubject, text: content.text, html: content.html,
        event_type: teamRegistrationSuccessEvent, team_id: existing.id, member_id: member.id,
        approval_sequence: nextSequence }));
      const queuedMail = await db.execute(sql`
        with transitioned as (
          update ${teams}
          set "registration_status" = 'approved', "approval_sequence" = ${nextSequence}
          where ${teams.id} = ${existing.id}
            and ${teams.registrationStatus} = ${existing.status}
            and ${teams.approvalSequence} = ${existing.approvalSequence}
          returning ${teams.id}
        )
        insert into ${emailQueue} (id, from_address, to_address, subject, text, html, status, event_type,
          team_id, member_id, approval_sequence, attempt_count, created_at, updated_at)
        select item.id, item.from_address, item.to_address, item.subject, item.text, item.html, 'pending',
          item.event_type, item.team_id, item.member_id, item.approval_sequence, 0, now(), now()
        from transitioned
        cross join jsonb_to_recordset(${JSON.stringify(queueRecords)}::jsonb) as item(
          id text, from_address text, to_address text, subject text, text text, html text, event_type text,
          team_id text, member_id text, approval_sequence integer
        )
        on conflict (team_id, member_id, event_type, approval_sequence) do nothing
        returning id
      `);
      if (queuedMail.rows.length === 0) {
        const [current] = await db.select({ id: teams.id, status: teams.registrationStatus })
          .from(teams).where(eq(teams.id, existing.id)).limit(1);
        return { ...current!, queuedMailCount: 0 };
      }
      return { id: existing.id, status: "approved" as const, queuedMailCount: queuedMail.rows.length };
    }

    const [team] = await db.update(teams).set({ registrationStatus: input.status })
      .where(eq(teams.id, input.teamId)).returning({ id: teams.id, status: teams.registrationStatus });
    if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
    return { ...team, queuedMailCount: 0 };
  }),
  listMail: adminProcedure.input(z.object({ status: mailListStatusSchema.default("pending") })).query(async ({ input }) => {
    const where = input.status === "all" ? undefined : eq(emailQueue.status, input.status);
    return db.select({ id: emailQueue.id, toAddress: emailQueue.toAddress, subject: emailQueue.subject,
      status: emailQueue.status, attemptCount: emailQueue.attemptCount, errorMessage: emailQueue.errorMessage,
      createdAt: emailQueue.createdAt, lastAttemptedAt: emailQueue.lastAttemptedAt, sentAt: emailQueue.sentAt,
      teamId: teams.id, teamName: teams.teamName, memberName: members.fullName })
      .from(emailQueue).innerJoin(teams, eq(emailQueue.teamId, teams.id))
      .innerJoin(members, eq(emailQueue.memberId, members.id)).where(where)
      .orderBy(sql`case ${emailQueue.status} when 'pending' then 0 when 'failed' then 1 else 2 end`, desc(emailQueue.createdAt));
  }),
  getMail: adminProcedure.input(z.object({ mailId: z.string().trim().min(1).max(128) })).query(async ({ input }) => {
    const [mail] = await db.select({ id: emailQueue.id, fromAddress: emailQueue.fromAddress,
      toAddress: emailQueue.toAddress, subject: emailQueue.subject, text: emailQueue.text, html: emailQueue.html,
      status: emailQueue.status, eventType: emailQueue.eventType, approvalSequence: emailQueue.approvalSequence,
      attemptCount: emailQueue.attemptCount, errorMessage: emailQueue.errorMessage, createdAt: emailQueue.createdAt,
      lastAttemptedAt: emailQueue.lastAttemptedAt, sentAt: emailQueue.sentAt, teamId: teams.id,
      teamName: teams.teamName, memberName: members.fullName }).from(emailQueue)
      .innerJoin(teams, eq(emailQueue.teamId, teams.id)).innerJoin(members, eq(emailQueue.memberId, members.id))
      .where(eq(emailQueue.id, input.mailId)).limit(1);
    if (!mail) throw new TRPCError({ code: "NOT_FOUND", message: "Mail not found" });
    return mail;
  }),
  sendMail: adminProcedure.input(z.object({ mailId: z.string().trim().min(1).max(128) })).mutation(async ({ input }) => {
    const [mail] = await db.select().from(emailQueue).where(eq(emailQueue.id, input.mailId)).limit(1);
    if (!mail) throw new TRPCError({ code: "NOT_FOUND", message: "Mail not found" });
    if (!mailStatusSchema.exclude(["sent"]).safeParse(mail.status).success) {
      throw new TRPCError({ code: "CONFLICT", message: "Mail has already been sent" });
    }

    const attemptedAt = new Date();
    try {
      await ses.send(new SendEmailCommand({ Source: encodeSesAddress(mail.fromAddress),
        Destination: { ToAddresses: [mail.toAddress] }, Message: {
          Subject: { Data: mail.subject, Charset: "UTF-8" }, Body: {
            Text: { Data: mail.text, Charset: "UTF-8" }, Html: { Data: mail.html, Charset: "UTF-8" },
          },
        } }));
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2000) : "Unknown SES error";
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
