import { z } from "zod";

import { isEligibleBirthdate, isValidBirthdate, TEAMMATE_COUNT } from "./registration";

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const normalizedEmail = z.string().trim().toLowerCase().email().max(254);
const gmailEmail = normalizedEmail.refine((email) => email.endsWith("@gmail.com"), {
  message: "GMAIL_EMAIL_REQUIRED",
});
const birthdate = z
  .string()
  .trim()
  .refine(isValidBirthdate, { message: "INVALID_BIRTHDATE" })
  .refine(isEligibleBirthdate, { message: "INELIGIBLE_BIRTHDATE" });
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s()-]+$/)
  .refine((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  });

export const cvFileSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.literal("application/pdf"),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
});

export const uploadedCvSchema = cvFileSchema.extend({ uploadId: z.uuid() });

export const createTeamInputSchema = z.object({
  uploadBatchId: z.uuid(),
  teamName: requiredText(100),
  captainFullName: requiredText(120),
  captainBirthdate: birthdate,
  captainPhone: phone,
  captainUniversityName: requiredText(160),
  captainCv: uploadedCvSchema,
  teammates: z
    .array(
      z.object({
        fullName: requiredText(120),
        email: gmailEmail,
        birthdate,
        universityName: requiredText(160),
        cv: uploadedCvSchema,
      }),
    )
    .length(TEAMMATE_COUNT),
});
