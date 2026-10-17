"use client";

import { rounds } from "@masc-landing/api/rounds";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { AdminHeading } from "@/app/admin/admin-state";
import { useRoundLabel } from "@/hooks/use-round-label";

export default function AdminSubmissionsPage() {
	const t = useTranslations("Admin");
	const roundLabel = useRoundLabel();

	return <><AdminHeading eyebrow={t("eyebrow")} title={t("submissions.title")} description={t("submissions.description")} />
		<div className="admin-round-settings">{rounds.map((round) => {
			const label = roundLabel(round.id);
			return <Card className="admin-round-setting" key={round.id}>
				<CardHeader><CardTitle>{label}</CardTitle><p>{t("round.description", { roundLabel: label })}</p></CardHeader>
				<CardContent><Button nativeButton={false} render={<Link href={`/admin/submissions/${round.slug}` as Route} />}>
					{t("submissions.openRound", { roundLabel: label })}</Button></CardContent>
			</Card>;
		})}</div>
	</>;
}
