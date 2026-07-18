import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@masc-landing/db";
import { adminEmails, dashboardTabSettings, emailQueue, members, roundSubmissions, submissionSettings, teams, user } from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  renderTeamRegistrationSuccess,
  teamRegistrationSuccessEvent,
  teamRegistrationSuccessSubject,
} from "../email/team-registration-success";
import { sendMail } from "../email/send-mail";
import { getDashboardTabSettings } from "../dashboard-tab-settings";
import { adminAreaProcedure, router } from "../index";
import { roundSchema } from "../rounds";
import { getSubmissionSettings } from "../submission-settings";

const signedUrlExpirySeconds = 300;
const overviewProcedure = adminAreaProcedure("overview");
const usersProcedure = adminAreaProcedure("users");
const teamsProcedure = adminAreaProcedure("teams");
const mailProcedure = adminAreaProcedure("mail");
const roundsProcedure = adminAreaProcedure("rounds");
const roundInput = z.object({ round: roundSchema });
const submissionInput = roundInput.extend({ submissionId: z.string().trim().min(1).max(128) });
const feedbackInput = submissionInput.extend({
  feedback: z.string().trim().min(1).max(5000),
  score: z.number().finite().nonnegative(),
});
const registrationStatusSchema = z.enum(["pending", "approved", "rejected"]);
const mailStatusSchema = z.enum(["pending", "sent", "failed"]);
const mailListStatusSchema = z.enum(["all", "pending", "sent", "failed"]);
const mailSender = `Ban Tổ chức MASC <${env.MAIL_USERNAME}>`;
const captainName = sql<string>`(select ${members.fullName} from ${members}
  where ${members.teamId} = ${teams.id} and ${members.isCaptain} = true limit 1)`;
const captainEmail = sql<string>`(select ${members.email} from ${members}
  where ${members.teamId} = ${teams.id} and ${members.isCaptain} = true limit 1)`;

const s3 = new S3Client({ region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
function identifiedSubmission(input: z.infer<typeof submissionInput>) {
  return and(eq(roundSubmissions.id, input.submissionId), eq(roundSubmissions.round, input.round), latestSubmission());
}
function latestSubmission() {
  return sql`not exists (
    select 1 from "round_submissions" as "newer_submission"
    where "newer_submission"."team_id" = ${roundSubmissions.teamId}
      and "newer_submission"."round" = ${roundSubmissions.round}
      and "newer_submission"."attempt_number" > ${roundSubmissions.attemptNumber}
  )`;
}
async function findSubmissionFile(input: z.infer<typeof submissionInput>) {
  const [submission] = await db.select({ objectKey: roundSubmissions.objectKey, filename: roundSubmissions.originalFilename,
    mimeType: roundSubmissions.mimeType }).from(roundSubmissions).where(identifiedSubmission(input)).limit(1);
  if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
  return submission;
}

export const adminRouter = router({
  getSubmissionSettings: overviewProcedure.query(getSubmissionSettings),
  setRoundSubmissionOpen: overviewProcedure.input(roundInput.extend({ isOpen: z.boolean() })).mutation(async ({ input }) => {
    await db.insert(submissionSettings).values({ round: input.round, isOpen: input.isOpen, updatedAt: new Date() })
      .onConflictDoUpdate({ target: submissionSettings.round, set: { isOpen: input.isOpen, updatedAt: new Date() } });
    return getSubmissionSettings();
  }),
  getDashboardTabSettings: overviewProcedure.query(getDashboardTabSettings),
  setRoundTabVisible: overviewProcedure.input(roundInput.extend({ isVisible: z.boolean() })).mutation(async ({ input }) => {
    await db.insert(dashboardTabSettings).values({ round: input.round, isVisible: input.isVisible, updatedAt: new Date() })
      .onConflictDoUpdate({ target: dashboardTabSettings.round,
        set: { isVisible: input.isVisible, updatedAt: new Date() } });
    return getDashboardTabSettings();
  }),
  listUsers: usersProcedure.query(async () => {
    const users = await db.select({ id: user.id, name: user.name, email: user.email,
      emailVerified: user.emailVerified, image: user.image, adminRole: adminEmails.role,
      createdAt: user.createdAt, updatedAt: user.updatedAt }).from(user)
      .leftJoin(adminEmails, eq(adminEmails.email, sql`lower(btrim(${user.email}))`))
      .orderBy(desc(user.createdAt));
    return users.map(({ adminRole, ...listedUser }) => ({
      ...listedUser,
      role: adminRole ?? ("user" as const),
    }));
  }),
  listTeams: teamsProcedure.query(async () => db.select({ id: teams.id, name: teams.teamName,
    status: teams.registrationStatus, createdAt: teams.createdAt, captainName, captainEmail,
    captainPhone: teams.captainPhone, memberCount: count(members.id) }).from(teams)
    .leftJoin(members, eq(teams.id, members.teamId))
    .groupBy(teams.id).orderBy(desc(teams.createdAt), asc(teams.teamName))),
  getTeam: teamsProcedure.input(z.object({ teamId: z.string().trim().min(1).max(128) })).query(async ({ input }) => {
    const [team] = await db.select({ id: teams.id, name: teams.teamName, status: teams.registrationStatus,
      createdAt: teams.createdAt, captainName, captainEmail, captainPhone: teams.captainPhone })
      .from(teams).where(eq(teams.id, input.teamId)).limit(1);
    if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
    const roster = await db.select({ id: members.id, fullName: members.fullName, email: members.email,
      birthdate: members.birthdate, universityName: members.universityName, isCaptain: members.isCaptain }).from(members)
      .where(eq(members.teamId, team.id)).orderBy(desc(members.isCaptain), asc(members.fullName));
    return { ...team, members: roster };
  }),
  updateTeamStatus: teamsProcedure.input(z.object({
    teamId: z.string().trim().min(1).max(128), status: registrationStatusSchema,
  })).mutation(async ({ input }) => {
    const [existing] = await db.select({ id: teams.id, name: teams.teamName, status: teams.registrationStatus,
      approvalSequence: teams.approvalSequence }).from(teams).where(eq(teams.id, input.teamId)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });

    if (input.status === "approved" && existing.status !== "approved") {
      const roster = await db.select({ id: members.id, fullName: members.fullName, email: members.email,
        universityName: members.universityName, isCaptain: members.isCaptain }).from(members).where(eq(members.teamId, existing.id))
        .orderBy(desc(members.isCaptain), asc(members.fullName));
      const captain = roster.find((member) => member.isCaptain);
      if (!captain) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Team captain not found" });
      const content = renderTeamRegistrationSuccess(existing.name, roster);
      const nextSequence = existing.approvalSequence + 1;
      const cc = roster.filter((member) => !member.isCaptain).map((member) => member.email);
      const queueRecord = { id: crypto.randomUUID(), from_address: mailSender, to_address: captain.email, cc,
        subject: teamRegistrationSuccessSubject, text: content.text, html: content.html,
        event_type: teamRegistrationSuccessEvent, team_id: existing.id, member_id: captain.id,
        approval_sequence: nextSequence };
      const queuedMail = await db.execute(sql`
        with transitioned as (
          update ${teams}
          set "registration_status" = 'approved', "approval_sequence" = ${nextSequence}
          where ${teams.id} = ${existing.id}
            and ${teams.registrationStatus} = ${existing.status}
            and ${teams.approvalSequence} = ${existing.approvalSequence}
          returning ${teams.id}
        )
        insert into ${emailQueue} (id, from_address, to_address, cc, subject, text, html, status, event_type,
          team_id, member_id, approval_sequence, attempt_count, created_at, updated_at)
        select item.id, item.from_address, item.to_address, item.cc, item.subject, item.text, item.html, 'pending',
          item.event_type, item.team_id, item.member_id, item.approval_sequence, 0, now(), now()
        from transitioned
        cross join jsonb_to_record(${JSON.stringify(queueRecord)}::jsonb) as item(
          id text, from_address text, to_address text, cc text[], subject text, text text, html text, event_type text,
          team_id text, member_id text, approval_sequence integer
        )
        on conflict (team_id, event_type, approval_sequence) do nothing
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
  listMail: mailProcedure.input(z.object({ status: mailListStatusSchema.default("pending") })).query(async ({ input }) => {
    const where = input.status === "all" ? undefined : eq(emailQueue.status, input.status);
    return db.select({ id: emailQueue.id, toAddress: emailQueue.toAddress, cc: emailQueue.cc, subject: emailQueue.subject,
      status: emailQueue.status, attemptCount: emailQueue.attemptCount, errorMessage: emailQueue.errorMessage,
      createdAt: emailQueue.createdAt, lastAttemptedAt: emailQueue.lastAttemptedAt, sentAt: emailQueue.sentAt,
      teamId: teams.id, teamName: teams.teamName, memberName: members.fullName })
      .from(emailQueue).innerJoin(teams, eq(emailQueue.teamId, teams.id))
      .innerJoin(members, eq(emailQueue.memberId, members.id)).where(where)
      .orderBy(sql`case ${emailQueue.status} when 'pending' then 0 when 'failed' then 1 else 2 end`, desc(emailQueue.createdAt));
  }),
  getMail: mailProcedure.input(z.object({ mailId: z.string().trim().min(1).max(128) })).query(async ({ input }) => {
    const [mail] = await db.select({ id: emailQueue.id, fromAddress: emailQueue.fromAddress,
      toAddress: emailQueue.toAddress, cc: emailQueue.cc, subject: emailQueue.subject, text: emailQueue.text, html: emailQueue.html,
      status: emailQueue.status, eventType: emailQueue.eventType, approvalSequence: emailQueue.approvalSequence,
      attemptCount: emailQueue.attemptCount, errorMessage: emailQueue.errorMessage, createdAt: emailQueue.createdAt,
      lastAttemptedAt: emailQueue.lastAttemptedAt, sentAt: emailQueue.sentAt, teamId: teams.id,
      teamName: teams.teamName, memberName: members.fullName }).from(emailQueue)
      .innerJoin(teams, eq(emailQueue.teamId, teams.id)).innerJoin(members, eq(emailQueue.memberId, members.id))
      .where(eq(emailQueue.id, input.mailId)).limit(1);
    if (!mail) throw new TRPCError({ code: "NOT_FOUND", message: "Mail not found" });
    return mail;
  }),
  sendMail: mailProcedure.input(z.object({ mailId: z.string().trim().min(1).max(128) })).mutation(async ({ input }) => {
    const [mail] = await db.select().from(emailQueue).where(eq(emailQueue.id, input.mailId)).limit(1);
    if (!mail) throw new TRPCError({ code: "NOT_FOUND", message: "Mail not found" });
    if (!mailStatusSchema.exclude(["sent"]).safeParse(mail.status).success) {
      throw new TRPCError({ code: "CONFLICT", message: "Mail has already been sent" });
    }

    const attemptedAt = new Date();
    try {
      await sendMail({ from: mail.fromAddress, to: mail.toAddress, cc: mail.cc, subject: mail.subject,
        text: mail.text, html: mail.html });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2000) : "Unknown mail provider error";
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
  listRoundSubmissions: roundsProcedure.input(roundInput).query(async ({ input }) => db.select({
    id: roundSubmissions.id, teamId: teams.id, teamName: teams.teamName, teamStatus: teams.registrationStatus,
    captainName, captainEmail, originalFilename: roundSubmissions.originalFilename,
    mimeType: roundSubmissions.mimeType, fileSize: roundSubmissions.fileSize, createdAt: roundSubmissions.createdAt,
    updatedAt: roundSubmissions.updatedAt,
  }).from(roundSubmissions).innerJoin(teams, eq(roundSubmissions.teamId, teams.id))
    .where(and(eq(roundSubmissions.round, input.round), latestSubmission()))
    .orderBy(desc(roundSubmissions.updatedAt), asc(teams.teamName))),
  getRoundSubmission: roundsProcedure.input(submissionInput).query(async ({ input }) => {
    const [submission] = await db.select({ id: roundSubmissions.id, description: roundSubmissions.description,
      feedback: roundSubmissions.feedback, score: roundSubmissions.score,
      feedbackPublished: roundSubmissions.feedbackPublished,
      originalFilename: roundSubmissions.originalFilename, mimeType: roundSubmissions.mimeType,
      fileSize: roundSubmissions.fileSize, createdAt: roundSubmissions.createdAt, updatedAt: roundSubmissions.updatedAt,
      teamId: teams.id, teamName: teams.teamName, teamStatus: teams.registrationStatus, teamCreatedAt: teams.createdAt,
      captainName, captainEmail, captainPhone: teams.captainPhone,
    }).from(roundSubmissions).innerJoin(teams, eq(roundSubmissions.teamId, teams.id))
      .where(identifiedSubmission(input)).limit(1);
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
    const roster = await db.select({ id: members.id, fullName: members.fullName, email: members.email,
      birthdate: members.birthdate, universityName: members.universityName, isCaptain: members.isCaptain }).from(members)
      .where(eq(members.teamId, submission.teamId)).orderBy(desc(members.isCaptain), asc(members.fullName));
    return { ...submission, members: roster };
  }),
  saveRoundFeedbackDraft: roundsProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const [submission] = await db.update(roundSubmissions)
      .set({ feedback: input.feedback, score: input.score, feedbackPublished: false })
      .where(identifiedSubmission(input)).returning({ id: roundSubmissions.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" }); return { success: true };
  }),
  publishRoundFeedback: roundsProcedure.input(feedbackInput).mutation(async ({ input }) => {
    const [submission] = await db.update(roundSubmissions)
      .set({ feedback: input.feedback, score: input.score, feedbackPublished: true })
      .where(identifiedSubmission(input)).returning({ id: roundSubmissions.id });
    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" }); return { success: true };
  }),
  createRoundDownloadUrl: roundsProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findSubmissionFile(input); const safeFilename = submission.filename.replace(/[^a-zA-Z0-9._ -]/g, "_");
    return { downloadUrl: await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentDisposition: `attachment; filename="${safeFilename}"` }), { expiresIn: signedUrlExpirySeconds }) };
  }),
  createRoundPreviewUrl: roundsProcedure.input(submissionInput).mutation(async ({ input }) => {
    const submission = await findSubmissionFile(input);
    const sourceUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: submission.objectKey,
      ResponseContentType: submission.mimeType, ResponseContentDisposition: "inline" }), { expiresIn: signedUrlExpirySeconds });
    return { previewUrl: submission.mimeType === "application/pdf" ? sourceUrl : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}` };
  }),
});
