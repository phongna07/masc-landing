import { z } from "zod";

import { TEAMMATE_COUNT } from "./registration";

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const normalizedEmail = z.string().trim().toLowerCase().email().max(254);
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s()-]+$/)
  .refine((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  });

export const createTeamInputSchema = z.object({
  teamName: requiredText(100),
  captainPhone: phone,
  captainUniversityName: requiredText(160),
  teammates: z
    .array(
      z.object({
        fullName: requiredText(120),
        email: normalizedEmail,
        universityName: requiredText(160),
      }),
    )
    .length(TEAMMATE_COUNT),
});
