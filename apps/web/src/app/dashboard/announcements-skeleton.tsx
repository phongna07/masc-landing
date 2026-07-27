"use client";

import { Card, CardContent, CardHeader } from "@masc-landing/ui/components/card";
import { Skeleton } from "@masc-landing/ui/components/skeleton";
import { useTranslations } from "next-intl";

export default function AnnouncementsSkeleton() {
	const t = useTranslations("Dashboard");

	return <div className="announcement-feed announcement-feed-skeleton" role="status" aria-busy="true">
		<span className="sr-only">{t("actions.loading")}</span>
		{Array.from({ length: 2 }, (_, index) => <Card className="announcement-post announcement-post-skeleton" key={index} aria-hidden="true">
			<CardHeader className="announcement-post-header">
				<Skeleton className="announcement-skeleton-avatar" />
				<div className="announcement-skeleton-meta">
					<Skeleton className="h-4 w-48 max-w-full" />
					<Skeleton className="h-3 w-32 max-w-full" />
				</div>
			</CardHeader>
			<CardContent className="announcement-skeleton-content">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-11/12" />
				<Skeleton className="h-4 w-3/5" />
			</CardContent>
		</Card>)}
	</div>;
}
