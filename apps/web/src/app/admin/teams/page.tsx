"use client";

import { roundIds } from "@masc-landing/api/rounds";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";

import { useRoundLabel } from "@/hooks/use-round-label";
import { AdminHeading } from "../admin-state";

export default function AdminTeamsPage() {
  const t = useTranslations("Admin");
  const roundLabel = useRoundLabel();
  return <><AdminHeading eyebrow={t("eyebrow")} title={t("teams.title")} description={t("teams.roundHubDescription")} />
    <div className="admin-round-settings">{roundIds.map((round) => <Card className="admin-round-setting" key={round}>
      <CardHeader><CardTitle>{t("teams.roundTitle", { roundLabel: roundLabel(round) })}</CardTitle><p>{t("teams.roundDescription", { roundLabel: roundLabel(round) })}</p></CardHeader>
      <CardContent><Button nativeButton={false} render={<Link href={`/admin/teams/round-${round}` as Route} />}>
        {t("teams.openRound", { roundLabel: roundLabel(round) })}</Button></CardContent>
    </Card>)}</div>
  </>;
}
