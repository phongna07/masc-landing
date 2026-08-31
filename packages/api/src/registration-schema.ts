import { z } from "zod";

import { isEligibleBirthdate, isValidBirthdate, TEAMMATE_COUNT } from "./registration";

const emojiPattern = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3)/u;

export const containsEmoji = (value: string) => emojiPattern.test(value);

const requiredText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).refine((value) => !containsEmoji(value), {
    message: "EMOJI_NOT_ALLOWED",
  });
const normalizedEmail = z.string().trim().toLowerCase().email().max(254);
const gmailEmail = normalizedEmail.refine((email) => email.endsWith("@gmail.com"), {
  message: "GMAIL_EMAIL_REQUIRED",
});
const birthdate = z
  .string()
  .trim()
  .refine(isValidBirthdate, { message: "INVALID_BIRTHDATE" })
  .refine(isEligibleBirthdate, { message: "INELIGIBLE_BIRTHDATE" });
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s()-]+$/)
  .refine((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  });

const facebookHostnames = ["facebook.com", "fb.com", "fb.me", "m.me", "messenger.com"] as const;
const maximumFacebookProfileUrlLength = 2048;

export function normalizeFacebookProfileUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximumFacebookProfileUrlLength) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    const isFacebookHostname = facebookHostnames.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
    const hasProfilePath = url.pathname.split("/").some(Boolean);
    if (
      !isFacebookHostname ||
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      !hasProfilePath
    ) return null;

    url.protocol = "https:";
    url.hostname = hostname;
    return url.toString();
  } catch {
    return null;
  }
}

export const facebookProfileUrlSchema = z.string().trim().min(1).max(maximumFacebookProfileUrlLength)
  .refine((value) => normalizeFacebookProfileUrl(value) !== null, { message: "INVALID_FACEBOOK_PROFILE_URL" })
  .transform((value) => normalizeFacebookProfileUrl(value)!);

export const awarenessSources = [
  "masc_fanpage",
  "masc_community_group",
  "other_facebook_group",
  "other_organization_fanpage",
  "media_ambassador",
] as const;
export type AwarenessSource = (typeof awarenessSources)[number];

export const awarenessSourcesRequiringDetail: readonly AwarenessSource[] = [
  "other_facebook_group",
  "other_organization_fanpage",
  "media_ambassador",
];

const awarenessSource = z.enum(awarenessSources);
const awarenessDetail = z.string().trim().max(200).refine((value) => !containsEmoji(value), {
  message: "EMOJI_NOT_ALLOWED",
}).optional();

const teammateSchema = z.object({
  fullName: requiredText(120),
  email: gmailEmail,
  birthdate,
  universityName: requiredText(160),
});

export const createTeamInputSchema = z.object({
  teamName: requiredText(100),
  captainFullName: requiredText(120),
  captainBirthdate: birthdate,
  captainPhone: phoneSchema,
  captainUniversityName: requiredText(160),
  awarenessSource,
  awarenessSourceDetail: awarenessDetail,
  teammates: z.array(teammateSchema).length(TEAMMATE_COUNT),
}).superRefine((input, context) => {
  if (
    awarenessSourcesRequiringDetail.includes(input.awarenessSource) &&
    !input.awarenessSourceDetail
  ) {
    context.addIssue({
      code: "custom",
      message: "AWARENESS_DETAIL_REQUIRED",
      path: ["awarenessSourceDetail"],
    });
  }
});

export const createRoundOneTeamDetailsInputSchema = createTeamInputSchema.safeExtend({
  captainFacebookProfileUrl: facebookProfileUrlSchema,
  teammates: z.array(teammateSchema.extend({
    phone: phoneSchema,
    facebookProfileUrl: facebookProfileUrlSchema,
  })).length(TEAMMATE_COUNT),
});
