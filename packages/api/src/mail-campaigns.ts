import { db } from "@masc-landing/db";
import {
	mailCampaignDeliveries,
	mailCampaigns,
	members,
	preferencesSettings,
	roundOneMembers,
	roundOneSubmissions,
	roundOneTeams,
	roundSubmissions,
	roundThreeMembers,
	roundThreeSubmissions,
	roundThreeTeams,
	roundTwoMembers,
	roundTwoSubmissions,
	roundTwoTeams,
	teams,
} from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, exists, inArray, lt, notExists, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
	renderMailCampaignTemplate,
	validateMailCampaignBodyTemplate,
	validateMailCampaignTemplate,
} from "./email/mail-campaign-template";
import { sendMail } from "./email/send-mail";
import {
	admissionMethods,
	eliminationFilters,
	preferenceStatuses,
	registrationStatuses,
	submissionFilters,
	type AdmissionMethod,
	type MailCampaignAudience,
	type MailCampaignInput,
	type MailCampaignTemplateValues,
	type PreferenceStatus,
	type RegistrationStatus,
} from "./mail-campaign-schema";
import { roundSchema, type RoundId } from "./rounds";

export * from "./mail-campaign-schema";

export const mailCampaignAudienceSchema = z.object({
	round: roundSchema,
	registrationStatuses: z.array(z.enum(registrationStatuses)).min(1).max(registrationStatuses.length),
	eliminationFilter: z.enum(eliminationFilters),
	submissionFilter: z.enum(submissionFilters),
	preferenceStatuses: z.array(z.enum(preferenceStatuses)).min(1).max(preferenceStatuses.length),
	admissionMethods: z.array(z.enum(admissionMethods)).min(1).max(admissionMethods.length),
});

function addTemplateIssue(value: string, context: z.RefinementCtx, body = false) {
	try {
		if (body) validateMailCampaignBodyTemplate(value);
		else validateMailCampaignTemplate(value);
	} catch (error) {
		context.addIssue({
			code: "custom",
			message: error instanceof Error ? error.message : "INVALID_TEMPLATE",
		});
	}
}

export const mailCampaignInputSchema = mailCampaignAudienceSchema.extend({
	name: z.string().trim().min(1).max(160),
	subjectTemplate: z.string().trim().min(1).max(250)
		.refine((value) => !/[\r\n]/.test(value), "SUBJECT_NEWLINES_NOT_ALLOWED")
		.superRefine((value, context) => addTemplateIssue(value, context)),
	bodyTemplate: z.string().min(1).max(20_000)
		.superRefine((value, context) => addTemplateIssue(value, context, true))
		.transform((value) => validateMailCampaignBodyTemplate(value)),
});

type AudienceTeamRow = {
	id: string;
	name: string;
	status: RegistrationStatus;
	isEliminated: boolean;
	captainPhone: string;
	preferenceStatus: PreferenceStatus | null;
	preferences: string[];
	assignedTrackId: string | null;
	admissionMethod: AdmissionMethod | null;
};

type AudienceMember = {
	id: string;
	teamId: string;
	fullName: string;
	email: string;
	universityName: string;
	phone: string | null;
	facebookProfileUrl: string | null;
	isCaptain: boolean;
};

export type ResolvedMailCampaignTeam = AudienceTeamRow & {
	members: AudienceMember[];
	captain: AudienceMember | null;
	cc: string[];
	assignedTrack: string;
	preferenceNames: string[];
	sendable: boolean;
};

function registrationTables(round: RoundId) {
	if (round === "0.5") return { team: teams, member: members, submission: roundSubmissions };
	if (round === "1") return {
		team: roundOneTeams as unknown as typeof teams,
		member: roundOneMembers as unknown as typeof members,
		submission: roundOneSubmissions as unknown as typeof roundSubmissions,
	};
	if (round === "2") return {
		team: roundTwoTeams as unknown as typeof teams,
		member: roundTwoMembers as unknown as typeof members,
		submission: roundTwoSubmissions as unknown as typeof roundSubmissions,
	};
	return {
		team: roundThreeTeams as unknown as typeof teams,
		member: roundThreeMembers as unknown as typeof members,
		submission: roundThreeSubmissions as unknown as typeof roundSubmissions,
	};
}

function audienceConditions(audience: MailCampaignAudience) {
	const { team, submission } = registrationTables(audience.round);
	const conditions = [inArray(team.registrationStatus, audience.registrationStatuses)];
	if (audience.eliminationFilter !== "any") {
		conditions.push(eq(team.isEliminated, audience.eliminationFilter === "eliminated"));
	}
	const submissionQuery = db.select({ id: submission.id }).from(submission)
		.where(eq(submission.teamId, team.id));
	if (audience.submissionFilter === "submitted") conditions.push(exists(submissionQuery));
	if (audience.submissionFilter === "not_submitted") conditions.push(notExists(submissionQuery));
	return conditions;
}

async function getAudienceMemberRows(round: RoundId, teamIds: string[]): Promise<AudienceMember[]> {
	if (round === "1") {
		return db.select({
			id: roundOneMembers.id,
			teamId: roundOneMembers.teamId,
			fullName: roundOneMembers.fullName,
			email: roundOneMembers.email,
			universityName: roundOneMembers.universityName,
			phone: roundOneMembers.phone,
			facebookProfileUrl: roundOneMembers.facebookProfileUrl,
			isCaptain: roundOneMembers.isCaptain,
		}).from(roundOneMembers).where(inArray(roundOneMembers.teamId, teamIds))
			.orderBy(asc(roundOneMembers.teamId), desc(roundOneMembers.isCaptain), asc(roundOneMembers.fullName), asc(roundOneMembers.id));
	}
	const { member } = registrationTables(round);
	const rows = await db.select({
		id: member.id,
		teamId: member.teamId,
		fullName: member.fullName,
		email: member.email,
		universityName: member.universityName,
		isCaptain: member.isCaptain,
	}).from(member).where(inArray(member.teamId, teamIds))
		.orderBy(asc(member.teamId), desc(member.isCaptain), asc(member.fullName), asc(member.id));
	return rows.map((memberRow) => ({ ...memberRow, phone: null, facebookProfileUrl: null }));
}

async function getAudienceTeamRows(audience: MailCampaignAudience): Promise<AudienceTeamRow[]> {
	if (audience.round === "1") {
		return db.select({
			id: roundOneTeams.id,
			name: roundOneTeams.teamName,
			status: roundOneTeams.registrationStatus,
			isEliminated: roundOneTeams.isEliminated,
			captainPhone: roundOneTeams.captainPhone,
			preferenceStatus: roundOneTeams.preferenceStatus,
			preferences: roundOneTeams.preferences,
			assignedTrackId: roundOneTeams.assignedTrackId,
			admissionMethod: roundOneTeams.admissionMethod,
		}).from(roundOneTeams).where(and(
			...audienceConditions(audience),
			inArray(roundOneTeams.preferenceStatus, audience.preferenceStatuses),
			inArray(roundOneTeams.admissionMethod, audience.admissionMethods),
		)).orderBy(asc(roundOneTeams.teamName), asc(roundOneTeams.id));
	}

	const { team } = registrationTables(audience.round);
	const rows = await db.select({
		id: team.id,
		name: team.teamName,
		status: team.registrationStatus,
		isEliminated: team.isEliminated,
		captainPhone: team.captainPhone,
	}).from(team).where(and(...audienceConditions(audience)))
		.orderBy(asc(team.teamName), asc(team.id));
	return rows.map((row) => ({
		...row,
		preferenceStatus: null,
		preferences: [],
		assignedTrackId: null,
		admissionMethod: null,
	}));
}

export async function resolveMailCampaignAudience(audience: MailCampaignAudience) {
	const teamRows = await getAudienceTeamRows(audience);
	if (!teamRows.length) return [];
	const [memberRows, trackRows] = await Promise.all([
		getAudienceMemberRows(audience.round, teamRows.map((team) => team.id)),
		audience.round === "1"
			? db.select({ id: preferencesSettings.id, name: preferencesSettings.name }).from(preferencesSettings)
			: Promise.resolve([]),
	]);
	const tracks = new Map(trackRows.map((track) => [track.id, track.name]));
	return teamRows.map((team): ResolvedMailCampaignTeam => {
		const roster = memberRows.filter((member) => member.teamId === team.id);
		const captain = roster.find((member) => member.isCaptain) ?? null;
		return {
			...team,
			members: roster,
			captain,
			cc: captain ? roster.filter((member) => member.id !== captain.id).map((member) => member.email) : [],
			assignedTrack: team.assignedTrackId ? tracks.get(team.assignedTrackId) ?? "" : "",
			preferenceNames: team.preferences.map((id) => tracks.get(id) ?? ""),
			sendable: roster.length === 3 && captain !== null,
		};
	});
}

export function campaignRowToInput(campaign: typeof mailCampaigns.$inferSelect): MailCampaignInput {
	return {
		name: campaign.name,
		round: campaign.round,
		registrationStatuses: campaign.registrationStatuses,
		eliminationFilter: campaign.eliminationFilter,
		submissionFilter: campaign.submissionFilter,
		preferenceStatuses: campaign.preferenceStatuses,
		admissionMethods: campaign.admissionMethods,
		subjectTemplate: campaign.subjectTemplate,
		bodyTemplate: campaign.bodyTemplate,
	};
}

function templateValues(team: ResolvedMailCampaignTeam, round: RoundId): MailCampaignTemplateValues {
	const member = (index: number) => team.members[index];
	return {
		team_name: team.name,
		round,
		captain_name: team.captain?.fullName ?? "",
		captain_email: team.captain?.email ?? "",
		captain_phone: team.captainPhone,
		member1_name: member(0)?.fullName ?? "",
		member1_email: member(0)?.email ?? "",
		member1_phone: member(0)?.phone ?? null,
		member1_facebook_profile_url: member(0)?.facebookProfileUrl ?? null,
		member1_university: member(0)?.universityName ?? "",
		member2_name: member(1)?.fullName ?? "",
		member2_email: member(1)?.email ?? "",
		member2_phone: member(1)?.phone ?? null,
		member2_facebook_profile_url: member(1)?.facebookProfileUrl ?? null,
		member2_university: member(1)?.universityName ?? "",
		member3_name: member(2)?.fullName ?? "",
		member3_email: member(2)?.email ?? "",
		member3_phone: member(2)?.phone ?? null,
		member3_facebook_profile_url: member(2)?.facebookProfileUrl ?? null,
		member3_university: member(2)?.universityName ?? "",
		assigned_track: team.assignedTrack,
		preference1: team.preferenceNames[0] ?? "",
		preference2: team.preferenceNames[1] ?? "",
		preference3: team.preferenceNames[2] ?? "",
	};
}

export function renderCampaignForTeam(input: MailCampaignInput, team: ResolvedMailCampaignTeam) {
	return renderMailCampaignTemplate({
		subjectTemplate: input.subjectTemplate,
		bodyTemplate: input.bodyTemplate,
		values: templateValues(team, input.round),
	});
}

export async function previewMailCampaign(input: MailCampaignInput, requestedTeamId?: string) {
	const audience = await resolveMailCampaignAudience(input);
	const team = requestedTeamId
		? audience.find((candidate) => candidate.id === requestedTeamId) ?? audience[0]
		: audience[0];
	return {
		matchCount: audience.length,
		teams: audience.map((candidate) => ({
			id: candidate.id,
			name: candidate.name,
			toAddress: candidate.captain?.email ?? "",
			cc: candidate.cc,
			sendable: candidate.sendable,
		})),
		preview: team ? {
			teamId: team.id,
			teamName: team.name,
			toAddress: team.captain?.email ?? "",
			cc: team.cc,
			...renderCampaignForTeam(input, team),
		} : null,
	};
}

export async function findMailCampaign(campaignId: string) {
	const [campaign] = await db.select().from(mailCampaigns).where(eq(mailCampaigns.id, campaignId)).limit(1);
	if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "MAIL_CAMPAIGN_NOT_FOUND" });
	return campaign;
}

export async function listMailCampaigns(archived: boolean) {
	const campaigns = await db.select().from(mailCampaigns)
		.where(archived ? sql`${mailCampaigns.archivedAt} is not null` : sql`${mailCampaigns.archivedAt} is null`)
		.orderBy(desc(mailCampaigns.updatedAt), asc(mailCampaigns.name));
	return Promise.all(campaigns.map(async (campaign) => {
		const [audience, deliveries] = await Promise.all([
			resolveMailCampaignAudience(campaignRowToInput(campaign)),
			db.select({ teamId: mailCampaignDeliveries.teamId, status: mailCampaignDeliveries.status })
				.from(mailCampaignDeliveries).where(eq(mailCampaignDeliveries.campaignId, campaign.id)),
		]);
		const sentTeamIds = new Set(deliveries.filter((delivery) => delivery.status === "sent").map((delivery) => delivery.teamId));
		return {
			id: campaign.id,
			name: campaign.name,
			round: campaign.round,
			archivedAt: campaign.archivedAt,
			createdAt: campaign.createdAt,
			updatedAt: campaign.updatedAt,
			audienceCount: audience.length,
			remainingCount: audience.filter((team) => !sentTeamIds.has(team.id)).length,
			failedCount: deliveries.filter((delivery) => delivery.status === "failed").length,
			sentCount: deliveries.filter((delivery) => delivery.status === "sent").length,
		};
	}));
}

export type MailCampaignTeamFilter = "all" | "not_sent" | "failed" | "sent";

export async function listMailCampaignTeams(options: {
	campaignId: string;
	status: MailCampaignTeamFilter;
	search?: string;
}) {
	const campaign = await findMailCampaign(options.campaignId);
	const [audience, deliveries] = await Promise.all([
		resolveMailCampaignAudience(campaignRowToInput(campaign)),
		db.select().from(mailCampaignDeliveries)
			.where(eq(mailCampaignDeliveries.campaignId, campaign.id)),
	]);
	const audienceById = new Map(audience.map((team) => [team.id, team]));
	const deliveriesByTeam = new Map(deliveries.map((delivery) => [delivery.teamId, delivery]));
	const staleBefore = Date.now() - 10 * 60 * 1000;
	const currentRows = audience.map((team) => {
		const delivery = deliveriesByTeam.get(team.id);
		const preserveSnapshot = delivery?.status === "sent" || delivery?.status === "sending";
		return {
			teamId: team.id,
			teamName: team.name,
			toAddress: preserveSnapshot ? delivery.toAddress : team.captain?.email ?? "",
			cc: preserveSnapshot ? delivery.cc : team.cc,
			status: delivery?.status ?? "not_sent" as const,
			currentEligible: true,
			sendable: team.sendable && campaign.archivedAt === null && (!delivery || delivery.status === "failed"
				|| (delivery.status === "sending" && (delivery.lastAttemptedAt?.getTime() ?? 0) < staleBefore)),
			attemptCount: delivery?.attemptCount ?? 0,
			lastAttemptedAt: delivery?.lastAttemptedAt ?? null,
			sentAt: delivery?.sentAt ?? null,
			errorMessage: delivery?.errorMessage ?? null,
		};
	});
	const historicalRows = deliveries.filter((delivery) => !audienceById.has(delivery.teamId)).map((delivery) => ({
		teamId: delivery.teamId,
		teamName: delivery.teamName,
		toAddress: delivery.toAddress,
		cc: delivery.cc,
		status: delivery.status as "sending" | "failed" | "sent",
		currentEligible: false,
		sendable: false,
		attemptCount: delivery.attemptCount,
		lastAttemptedAt: delivery.lastAttemptedAt,
		sentAt: delivery.sentAt,
		errorMessage: delivery.errorMessage,
	}));
	const search = options.search?.trim().toLocaleLowerCase();
	return [...currentRows, ...historicalRows]
		.filter((row) => {
			if (options.status === "not_sent" && row.status !== "not_sent") return false;
			if (options.status === "failed" && row.status !== "failed") return false;
			if (options.status === "sent" && row.status !== "sent") return false;
			if (!search) return true;
			return `${row.teamName} ${row.toAddress} ${row.cc.join(" ")}`.toLocaleLowerCase().includes(search);
		})
		.sort((left, right) => left.teamName.localeCompare(right.teamName) || left.teamId.localeCompare(right.teamId));
}

export async function sendMailCampaignTeam(campaignId: string, teamId: string) {
	const campaign = await findMailCampaign(campaignId);
	if (campaign.archivedAt) throw new TRPCError({ code: "CONFLICT", message: "MAIL_CAMPAIGN_ARCHIVED" });
	const input = campaignRowToInput(campaign);
	const audience = await resolveMailCampaignAudience(input);
	const team = audience.find((candidate) => candidate.id === teamId);
	if (!team) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TEAM_NOT_IN_CAMPAIGN_AUDIENCE" });
	if (!team.sendable || !team.captain) {
		throw new TRPCError({ code: "PRECONDITION_FAILED", message: "TEAM_ROSTER_NOT_SENDABLE" });
	}

	const rendered = renderCampaignForTeam(input, team);
	const attemptedAt = new Date();
	const attemptToken = crypto.randomUUID();
	const staleAt = new Date(attemptedAt.getTime() - 10 * 60 * 1000);
	const [claim] = await db.insert(mailCampaignDeliveries).values({
		campaignId,
		teamId,
		teamName: team.name,
		toAddress: team.captain.email,
		cc: team.cc,
		subject: rendered.subject,
		text: rendered.text,
		html: rendered.html,
		status: "sending",
		attemptToken,
		attemptCount: 1,
		lastAttemptedAt: attemptedAt,
	}).onConflictDoUpdate({
		target: [mailCampaignDeliveries.campaignId, mailCampaignDeliveries.teamId],
		set: {
			teamName: team.name,
			toAddress: team.captain.email,
			cc: team.cc,
			subject: rendered.subject,
			text: rendered.text,
			html: rendered.html,
			status: "sending",
			attemptToken,
			attemptCount: sql`${mailCampaignDeliveries.attemptCount} + 1`,
			lastAttemptedAt: attemptedAt,
			errorMessage: null,
			updatedAt: attemptedAt,
		},
		setWhere: or(
			eq(mailCampaignDeliveries.status, "failed"),
			and(eq(mailCampaignDeliveries.status, "sending"), lt(mailCampaignDeliveries.lastAttemptedAt, staleAt)),
		),
	}).returning({ id: mailCampaignDeliveries.id });
	if (!claim) throw new TRPCError({ code: "CONFLICT", message: "MAIL_CAMPAIGN_TEAM_ALREADY_SENT_OR_SENDING" });

	const sender = `Ban Tổ chức MASC <${env.MAIL_USERNAME}>`;
	try {
		await sendMail({
			id: claim.id,
			from: sender,
			to: team.captain.email,
			cc: team.cc,
			subject: rendered.subject,
			text: rendered.text,
			html: rendered.html,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message.slice(0, 2_000) : "Unknown mail provider error";
		await db.update(mailCampaignDeliveries).set({
			status: "failed",
			errorMessage: message,
			updatedAt: new Date(),
		}).where(and(
			eq(mailCampaignDeliveries.id, claim.id),
			eq(mailCampaignDeliveries.attemptToken, attemptToken),
		));
		throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EMAIL_SEND_FAILED" });
	}

	const [sent] = await db.update(mailCampaignDeliveries).set({
		status: "sent",
		sentAt: new Date(),
		errorMessage: null,
		updatedAt: new Date(),
	}).where(and(
		eq(mailCampaignDeliveries.id, claim.id),
		eq(mailCampaignDeliveries.attemptToken, attemptToken),
	)).returning({ id: mailCampaignDeliveries.id, status: mailCampaignDeliveries.status });
	if (!sent) throw new TRPCError({ code: "CONFLICT", message: "MAIL_CAMPAIGN_DELIVERY_SUPERSEDED" });
	return sent;
}
