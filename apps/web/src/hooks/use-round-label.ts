"use client";

import type { RoundId } from "@masc-landing/api/rounds";
import { useTranslations } from "next-intl";

const roundLabelKeys = {
	"0.5": "preliminary",
	"1": "round1",
	"2": "round2",
	"3": "round3",
} as const satisfies Record<RoundId, "preliminary" | "round1" | "round2" | "round3">;

export function useRoundLabel() {
	const t = useTranslations("RoundLabels");

	return (round: RoundId | number) => {
		const key = roundLabelKeys[String(round) as RoundId];
		return key ? t(key) : t("numbered", { round });
	};
}
