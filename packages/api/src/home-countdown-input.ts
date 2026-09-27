import { z } from "zod";

const countdownText = z.string().trim().min(1).max(200);
const countdownCopySchema = z.object({
	applications: countdownText,
	closesIn: countdownText,
	opensIn: countdownText,
	closed: countdownText,
});

export const homeCountdownInputSchema = z.object({
	openAt: z.string().datetime({ offset: true }),
	closeAt: z.string().datetime({ offset: true }),
	en: countdownCopySchema,
	vi: countdownCopySchema,
}).refine((input) => Date.parse(input.openAt) < Date.parse(input.closeAt), {
	path: ["closeAt"],
	message: "CLOSE_AT_MUST_FOLLOW_OPEN_AT",
});

export type HomeCountdownInput = z.infer<typeof homeCountdownInputSchema>;
