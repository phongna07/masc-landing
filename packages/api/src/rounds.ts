import { z } from "zod";

export const roundIds = ["0.5", "1", "2", "3"] as const;
export const roundSchema = z.enum(roundIds);
export type RoundId = z.infer<typeof roundSchema>;

export const rounds = roundIds.map((id) => ({
	id,
	slug: `round-${id}`,
})) as readonly { id: RoundId; slug: string }[];

export function roundFromSlug(slug: string) {
	return rounds.find((round) => round.slug === slug)?.id ?? null;
}
