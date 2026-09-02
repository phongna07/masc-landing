import assert from "node:assert/strict";
import test from "node:test";

import {
	mailCampaignAudienceSchema,
	matchesRoundOnePreferenceSelection,
	unknownMailCampaignTrackIds,
} from "./mail-campaign-audience";
import type { MailCampaignAudience } from "./mail-campaign-schema";

const product = "round-1-product-growth";
const societal = "round-1-societal-pr-marcom";
const marketResearch = "round-1-market-research-trade";

const audience = (overrides: Partial<MailCampaignAudience> = {}): MailCampaignAudience => ({
	round: "1" as const,
	registrationStatuses: ["approved" as const],
	eliminationFilter: "active" as const,
	submissionFilter: "any" as const,
	preferenceStatuses: ["assigned" as const],
	assignedTrackIds: [product],
	admissionMethods: ["cv_screening" as const],
	...overrides,
});

test("assigned teams match one or multiple selected tracks", () => {
	assert.equal(matchesRoundOnePreferenceSelection(
		{ preferenceStatus: "assigned", assignedTrackId: product }, audience()), true);
	assert.equal(matchesRoundOnePreferenceSelection(
		{ preferenceStatus: "assigned", assignedTrackId: societal }, audience()), false);
	assert.equal(matchesRoundOnePreferenceSelection(
			{ preferenceStatus: "assigned", assignedTrackId: societal },
			audience({ assignedTrackIds: [product, societal] })), true);
});

test("selecting all tracks preserves broad assigned-track matching", () => {
	const allTracks = audience({ assignedTrackIds: [product, societal, marketResearch] });
	for (const assignedTrackId of allTracks.assignedTrackIds) {
		assert.equal(matchesRoundOnePreferenceSelection(
			{ preferenceStatus: "assigned", assignedTrackId }, allTracks), true);
	}
});

test("track selection narrows only the assigned branch of mixed statuses", () => {
	const mixed = audience({ preferenceStatuses: ["submitted", "assigned"] });
	assert.equal(matchesRoundOnePreferenceSelection(
		{ preferenceStatus: "submitted", assignedTrackId: null }, mixed), true);
	assert.equal(matchesRoundOnePreferenceSelection(
		{ preferenceStatus: "assigned", assignedTrackId: societal }, mixed), false);
});

test("assigned status requires a track in Round 1 but tracks are ignored by other rounds", () => {
	assert.equal(mailCampaignAudienceSchema.safeParse(audience({ assignedTrackIds: [] })).success, false);
	assert.equal(mailCampaignAudienceSchema.safeParse(audience({
		round: "2",
		assignedTrackIds: [],
	})).success, true);
});

test("duplicate and unknown track IDs are rejected", () => {
	assert.equal(mailCampaignAudienceSchema.safeParse(audience({ assignedTrackIds: [product, product] })).success, false);
	assert.deepEqual(unknownMailCampaignTrackIds([product, "missing"], [product, societal]), ["missing"]);
});
