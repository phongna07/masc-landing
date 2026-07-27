"use client";

import { roundIds } from "@masc-landing/api/rounds";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import Link from "next/link";
import type { Route } from "next";
import { useTranslations } from "next-intl";

import { AdminHeading } from "../admin-state";

export default function AdminTeamsPage() {
  const t = useTranslations("Admin");
  return <><AdminHeading eyebrow={t("eyebrow")} title={t("teams.title")} description={t("teams.roundHubDescription")} />
    <div className="admin-round-settings">{roundIds.map((round) => <Card className="admin-round-setting" key={round}>
      <CardHeader><CardTitle>{t("teams.roundTitle", { round })}</CardTitle><p>{t("teams.roundDescription", { round })}</p></CardHeader>
      <CardContent><Button nativeButton={false} render={<Link href={`/admin/teams/round-${round}` as Route} />}>
        {t("teams.openRound", { round })}</Button></CardContent>
    </Card>)}</div>
  </>;
}
