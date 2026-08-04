"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { MegaphoneIcon, RefreshCwIcon } from "lucide-react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";

import mascLogo from "@/assets/masc-logo-new.png";
import { SafeLinkifiedText } from "@/components/safe-linkified-text";
import { trpc } from "@/utils/trpc";

import AnnouncementsSkeleton from "./announcements-skeleton";

export default function AnnouncementsFeed() {
	const t = useTranslations("Dashboard");
	const format = useFormatter();
	const announcements = useQuery(trpc.announcements.list.queryOptions());

	if (announcements.isPending) return <AnnouncementsSkeleton />;
	if (announcements.isError) return <Card className="dashboard-state-card">
		<CardHeader><CardTitle>{t("announcements.errors.loadTitle")}</CardTitle></CardHeader>
		<CardContent><p>{t("announcements.errors.load")}</p><Button onClick={() => announcements.refetch()}>
			<RefreshCwIcon aria-hidden="true" />{t("actions.retry")}
		</Button></CardContent>
	</Card>;
	if (announcements.data.length === 0) return <Card className="announcement-empty">
		<MegaphoneIcon aria-hidden="true" /><h2>{t("announcements.emptyTitle")}</h2><p>{t("announcements.emptyDescription")}</p>
	</Card>;

	return <div className="announcement-feed">{announcements.data.map((announcement) => <Card className="announcement-post" key={announcement.id}>
		<CardHeader className="announcement-post-header"><div className="announcement-avatar"><Image src={mascLogo} alt="" /></div><div>
			<CardTitle>{t("announcements.organizer")}</CardTitle>
			<time dateTime={new Date(announcement.createdAt).toISOString()}>{format.dateTime(new Date(announcement.createdAt), { dateStyle: "medium", timeStyle: "short" })}</time>
		</div></CardHeader>
		<CardContent><p className="announcement-content"><SafeLinkifiedText text={announcement.content} /></p>{announcement.imageUrl && <img className="announcement-image" src={announcement.imageUrl} alt="" />}</CardContent>
	</Card>)}</div>;
}
