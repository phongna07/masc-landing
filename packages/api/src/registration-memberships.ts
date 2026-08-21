import { db } from "@masc-landing/db";
import {
	members,
	roundOneMemberCvs,
	roundOneMembers,
	roundOneTeams,
	roundThreeMembers,
	roundThreeTeams,
	roundTwoMembers,
	roundTwoTeams,
	teams,
} from "@masc-landing/db/schema/index";
import { and, eq, or, sql } from "drizzle-orm";

import type { RoundId } from "./rounds";
import { resolveRoundOnePreferences } from "./round-one-preferences";

export type MembershipUser = { id: string; email: string };

async function roundHalfMembership(user: MembershipUser) {
	const email = user.email.trim().toLowerCase();
	const [membership] = await db.select({
		isCaptain: members.isCaptain,
		teamId: teams.id,
		teamName: teams.teamName,
		registrationStatus: teams.registrationStatus,
		isEliminated: teams.isEliminated,
		captainPhone: teams.captainPhone,
	}).from(members).innerJoin(teams, eq(members.teamId, teams.id)).where(or(
		and(eq(teams.captainId, user.id), eq(members.isCaptain, true)),
		sql`lower(${members.email}) = ${email}`,
	)).limit(1);
	if (!membership) return { registered: false as const, round: "0.5" as const };
	const roster = await db.select({
		id: members.id,
		fullName: members.fullName,
		email: members.email,
		birthdate: members.birthdate,
		universityName: members.universityName,
		isCaptain: members.isCaptain,
	}).from(members).where(eq(members.teamId, membership.teamId))
		.orderBy(sql`${members.isCaptain} desc`, members.fullName);
	return {
		registered: true as const,
		round: "0.5" as const,
		role: membership.isCaptain ? "captain" as const : "member" as const,
		team: {
			id: membership.teamId,
			name: membership.teamName,
			status: membership.registrationStatus,
			isEliminated: membership.isEliminated,
			captainPhone: membership.captainPhone,
			admissionMethod: "direct" as const,
			members: roster,
		},
	};
}

async function roundOneMembership(user: MembershipUser) {
	const email = user.email.trim().toLowerCase();
	const [membership] = await db.select({
		isCaptain: roundOneMembers.isCaptain,
		teamId: roundOneTeams.id,
		teamName: roundOneTeams.teamName,
		registrationStatus: roundOneTeams.registrationStatus,
		isEliminated: roundOneTeams.isEliminated,
		captainPhone: roundOneTeams.captainPhone,
		admissionMethod: roundOneTeams.admissionMethod,
		sourceTeamId: roundOneTeams.sourceRoundHalfTeamId,
		preferenceStatus: roundOneTeams.preferenceStatus,
		preferences: roundOneTeams.preferences,
		assignedTrackId: roundOneTeams.assignedTrackId,
	}).from(roundOneMembers).innerJoin(roundOneTeams, eq(roundOneMembers.teamId, roundOneTeams.id)).where(or(
		and(eq(roundOneTeams.captainId, user.id), eq(roundOneMembers.isCaptain, true)),
		sql`lower(${roundOneMembers.email}) = ${email}`,
	)).limit(1);
	if (!membership) return { registered: false as const, round: "1" as const };
	const [roster, resolvedPreferences] = await Promise.all([db.select({
		id: roundOneMembers.id,
		fullName: roundOneMembers.fullName,
		email: roundOneMembers.email,
		birthdate: roundOneMembers.birthdate,
		universityName: roundOneMembers.universityName,
		isCaptain: roundOneMembers.isCaptain,
		hasCv: sql<boolean>`${roundOneMemberCvs.id} is not null`,
	}).from(roundOneMembers).leftJoin(roundOneMemberCvs, eq(roundOneMemberCvs.memberId, roundOneMembers.id))
		.where(eq(roundOneMembers.teamId, membership.teamId))
		.orderBy(sql`${roundOneMembers.isCaptain} desc`, roundOneMembers.fullName),
		resolveRoundOnePreferences(membership.preferences),
	]);
	return {
		registered: true as const,
		round: "1" as const,
		role: membership.isCaptain ? "captain" as const : "member" as const,
		team: {
			id: membership.teamId,
			name: membership.teamName,
			status: membership.registrationStatus,
			isEliminated: membership.isEliminated,
			captainPhone: membership.captainPhone,
			admissionMethod: membership.admissionMethod,
			sourceTeamId: membership.sourceTeamId,
			preferenceStatus: membership.preferenceStatus,
			preferences: resolvedPreferences,
			assignedTrack: resolvedPreferences.find((preference) => preference.id === membership.assignedTrackId) ?? null,
			members: roster,
		},
	};
}

async function roundTwoMembership(user: MembershipUser) {
	const email = user.email.trim().toLowerCase();
	const [membership] = await db.select({
		isCaptain: roundTwoMembers.isCaptain,
		teamId: roundTwoTeams.id,
		teamName: roundTwoTeams.teamName,
		registrationStatus: roundTwoTeams.registrationStatus,
		isEliminated: roundTwoTeams.isEliminated,
		captainPhone: roundTwoTeams.captainPhone,
		sourceRoundHalfTeamId: roundTwoTeams.sourceRoundHalfTeamId,
		sourceRoundOneTeamId: roundTwoTeams.sourceRoundOneTeamId,
	}).from(roundTwoMembers).innerJoin(roundTwoTeams, eq(roundTwoMembers.teamId, roundTwoTeams.id)).where(or(
		and(eq(roundTwoTeams.captainId, user.id), eq(roundTwoMembers.isCaptain, true)),
		sql`lower(${roundTwoMembers.email}) = ${email}`,
	)).limit(1);
	if (!membership) return { registered: false as const, round: "2" as const };
	const roster = await db.select({
		id: roundTwoMembers.id,
		fullName: roundTwoMembers.fullName,
		email: roundTwoMembers.email,
		birthdate: roundTwoMembers.birthdate,
		universityName: roundTwoMembers.universityName,
		isCaptain: roundTwoMembers.isCaptain,
	}).from(roundTwoMembers).where(eq(roundTwoMembers.teamId, membership.teamId))
		.orderBy(sql`${roundTwoMembers.isCaptain} desc`, roundTwoMembers.fullName);
	return {
		registered: true as const,
		round: "2" as const,
		role: membership.isCaptain ? "captain" as const : "member" as const,
		team: {
			id: membership.teamId,
			name: membership.teamName,
			status: membership.registrationStatus,
			isEliminated: membership.isEliminated,
			captainPhone: membership.captainPhone,
			admissionMethod: "promotion" as const,
			sourceRound: membership.sourceRoundOneTeamId ? "1" as const : "0.5" as const,
			sourceTeamId: membership.sourceRoundOneTeamId ?? membership.sourceRoundHalfTeamId,
			members: roster,
		},
	};
}

async function roundThreeMembership(user: MembershipUser) {
	const email = user.email.trim().toLowerCase();
	const [membership] = await db.select({
		isCaptain: roundThreeMembers.isCaptain,
		teamId: roundThreeTeams.id,
		teamName: roundThreeTeams.teamName,
		registrationStatus: roundThreeTeams.registrationStatus,
		isEliminated: roundThreeTeams.isEliminated,
		captainPhone: roundThreeTeams.captainPhone,
		sourceTeamId: roundThreeTeams.sourceRoundTwoTeamId,
	}).from(roundThreeMembers).innerJoin(roundThreeTeams, eq(roundThreeMembers.teamId, roundThreeTeams.id)).where(or(
		and(eq(roundThreeTeams.captainId, user.id), eq(roundThreeMembers.isCaptain, true)),
		sql`lower(${roundThreeMembers.email}) = ${email}`,
	)).limit(1);
	if (!membership) return { registered: false as const, round: "3" as const };
	const roster = await db.select({
		id: roundThreeMembers.id,
		fullName: roundThreeMembers.fullName,
		email: roundThreeMembers.email,
		birthdate: roundThreeMembers.birthdate,
		universityName: roundThreeMembers.universityName,
		isCaptain: roundThreeMembers.isCaptain,
	}).from(roundThreeMembers).where(eq(roundThreeMembers.teamId, membership.teamId))
		.orderBy(sql`${roundThreeMembers.isCaptain} desc`, roundThreeMembers.fullName);
	return {
		registered: true as const,
		round: "3" as const,
		role: membership.isCaptain ? "captain" as const : "member" as const,
		team: {
			id: membership.teamId,
			name: membership.teamName,
			status: membership.registrationStatus,
			isEliminated: membership.isEliminated,
			captainPhone: membership.captainPhone,
			admissionMethod: "promotion" as const,
			sourceRound: "2" as const,
			sourceTeamId: membership.sourceTeamId,
			members: roster,
		},
	};
}

export async function getRoundMembership(user: MembershipUser, round: RoundId) {
	if (round === "0.5") return roundHalfMembership(user);
	if (round === "1") return roundOneMembership(user);
	if (round === "2") return roundTwoMembership(user);
	return roundThreeMembership(user);
}

export async function getRoundMemberships(user: MembershipUser) {
	const [roundHalf, roundOne, roundTwo, roundThree] = await Promise.all([
		roundHalfMembership(user),
		roundOneMembership(user),
		roundTwoMembership(user),
		roundThreeMembership(user),
	]);
	return { "0.5": roundHalf, "1": roundOne, "2": roundTwo, "3": roundThree };
}
