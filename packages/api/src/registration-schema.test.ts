import assert from "node:assert/strict";
import test from "node:test";

import { getEligibleBirthdateRange } from "./registration";
import {
	createRoundOneTeamDetailsInputSchema,
	createTeamInputSchema,
	facebookProfileUrlSchema,
	normalizeFacebookProfileUrl,
} from "./registration-schema";

test("normalizes supported Facebook and Meta profile links to HTTPS", () => {
	const cases = [
		["facebook.com/masc.vn", "https://facebook.com/masc.vn"],
		["http://m.facebook.com/profile.php?id=123", "https://m.facebook.com/profile.php?id=123"],
		["https://web.facebook.com/masc.vn", "https://web.facebook.com/masc.vn"],
		["fb.com/masc.vn", "https://fb.com/masc.vn"],
		["fb.me/masc.vn", "https://fb.me/masc.vn"],
		["m.me/masc.vn", "https://m.me/masc.vn"],
		["messenger.com/t/masc.vn", "https://messenger.com/t/masc.vn"],
	] as const;

	for (const [input, expected] of cases) {
		assert.equal(normalizeFacebookProfileUrl(input), expected);
		assert.equal(facebookProfileUrlSchema.parse(input), expected);
	}
});

test("rejects invalid, unsafe, root-only, and lookalike Facebook links", () => {
	const invalid = [
		"facebook.com",
		"https://fb.me/",
		"https://facebook.com.evil.example/profile",
		"https://notfacebook.com/profile",
		"ftp://facebook.com/profile",
		"https://user:password@facebook.com/profile",
		"not a url",
		`facebook.com/${"a".repeat(2048)}`,
	];

	for (const input of invalid) {
		assert.equal(normalizeFacebookProfileUrl(input), null);
		assert.equal(facebookProfileUrlSchema.safeParse(input).success, false);
	}
});

function baseRegistrationInput() {
	const birthdate = getEligibleBirthdateRange().min;
	return {
		teamName: "Team Hypernova",
		captainFullName: "Captain One",
		captainBirthdate: birthdate,
		captainPhone: "+84 912 345 678",
		captainUniversityName: "MASC University",
		awarenessSource: "masc_fanpage" as const,
		teammates: [
			{
				fullName: "Member Two",
				email: "member.two@gmail.com",
				birthdate,
				universityName: "MASC University",
			},
			{
				fullName: "Member Three",
				email: "member.three@gmail.com",
				birthdate,
				universityName: "MASC University",
			},
		],
	};
}

test("keeps Round 0.5 registration contact input unchanged", () => {
	assert.equal(createTeamInputSchema.safeParse(baseRegistrationInput()).success, true);
});

test("requires valid phone and Facebook details for every new Round 1 member", () => {
	const base = baseRegistrationInput();
	const valid = {
		...base,
		captainFacebookProfileUrl: "facebook.com/captain.one",
		teammates: base.teammates.map((member, index) => ({
			...member,
			phone: index === 0 ? "0912345678" : "0987654321",
			facebookProfileUrl: `facebook.com/member.${index + 2}`,
		})),
	};
	const parsed = createRoundOneTeamDetailsInputSchema.safeParse(valid);
	assert.equal(parsed.success, true);
	if (parsed.success) {
		assert.equal(parsed.data.captainFacebookProfileUrl, "https://facebook.com/captain.one");
		assert.equal(parsed.data.teammates[0]?.facebookProfileUrl, "https://facebook.com/member.2");
	}

	assert.equal(createRoundOneTeamDetailsInputSchema.safeParse({
		...valid,
		captainFacebookProfileUrl: undefined,
	}).success, false);
	assert.equal(createRoundOneTeamDetailsInputSchema.safeParse({
		...valid,
		captainPhone: "123",
	}).success, false);
	assert.equal(createRoundOneTeamDetailsInputSchema.safeParse({
		...valid,
		teammates: valid.teammates.map((member, index) => index === 0 ? { ...member, phone: "" } : member),
	}).success, false);
	assert.equal(createRoundOneTeamDetailsInputSchema.safeParse({
		...valid,
		teammates: valid.teammates.map((member, index) => index === 1
			? { ...member, facebookProfileUrl: "example.com/member" }
			: member),
	}).success, false);
});
