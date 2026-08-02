"use client";

import type { AppRouter } from "@masc-landing/api/routers/index";
import { Button } from "@masc-landing/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { CheckCircle2Icon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { useRoundLabel } from "@/hooks/use-round-label";
import { trpc } from "@/utils/trpc";

type UserAnnouncements = inferRouterOutputs<AppRouter>["userAnnouncements"]["listMine"];

export default function PromotionAnnouncements({ initialAnnouncements }: {
  initialAnnouncements: UserAnnouncements;
}) {
  const t = useTranslations("Dashboard.promotionAnnouncements");
  const roundLabel = useRoundLabel();
  const format = useFormatter();
  const announcements = useQuery({
    ...trpc.userAnnouncements.listMine.queryOptions(),
    initialData: initialAnnouncements,
  });

  if (announcements.isError) return <div className="promotion-announcement promotion-announcement-error" role="alert">
    <TriangleAlertIcon aria-hidden="true" />
    <div><strong>{t("errors.title")}</strong><p>{t("errors.description")}</p></div>
    <Button type="button" variant="outline" size="sm" onClick={() => announcements.refetch()}>
      <RefreshCwIcon aria-hidden="true" />{t("errors.retry")}
    </Button>
  </div>;
  if (announcements.data.length === 0) return null;

  return <section className="promotion-announcements" aria-label={t("label")}>
    {announcements.data.map((announcement) => <div className="promotion-announcement" role="status"
      key={announcement.id}>
      <CheckCircle2Icon aria-hidden="true" />
      <div className="promotion-announcement-copy">
        <span className="sr-only">{t("successLabel")}</span>
        <strong>{t("title", { roundLabel: roundLabel(announcement.round) })}</strong>
        <p>{t("description", { team: announcement.teamName, roundLabel: roundLabel(announcement.round) })}</p>
      </div>
      <time dateTime={new Date(announcement.createdAt).toISOString()}>
        {format.dateTime(new Date(announcement.createdAt), { dateStyle: "medium", timeStyle: "short" })}
      </time>
    </div>)}
  </section>;
}
