"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { ArchiveIcon, ChevronRightIcon, MailPlusIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { useRoundLabel } from "@/hooks/use-round-label";
import { trpc } from "@/utils/trpc";
import { AdminEmpty, AdminError, AdminHeading, AdminLoading, formatDate } from "../admin-state";

export default function AdminMailPage() {
	const t = useTranslations("Admin.mail");
	const locale = useLocale();
	const roundLabel = useRoundLabel();
	const [archived, setArchived] = useState(false);
	const campaigns = useQuery(trpc.admin.listMailCampaigns.queryOptions({ archived }));
	return <>
		<div className="admin-heading-actions"><AdminHeading eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
			<Link href="/admin/mail/new"><Button><MailPlusIcon />{t("newCampaign")}</Button></Link></div>
		<div className="mail-campaign-list-toolbar" role="group" aria-label={t("archiveFilterLabel")}>
			<Button variant={!archived ? "default" : "outline"} onClick={() => setArchived(false)}>{t("active")}</Button>
			<Button variant={archived ? "default" : "outline"} onClick={() => setArchived(true)}><ArchiveIcon />{t("archived")}</Button>
		</div>
		{campaigns.isPending ? <AdminLoading /> : campaigns.isError ? <AdminError title={t("loadErrorTitle")}
			description={t("loadError")} retry={() => campaigns.refetch()} retryLabel={t("retry")} />
			: campaigns.data.length === 0 ? <AdminEmpty title={t("emptyCampaigns")} description={t("emptyCampaignsDescription")} />
				: <Card className="admin-table-card"><CardContent className="admin-table-scroll"><table className="admin-table mail-campaign-table">
					<thead><tr><th>{t("fields.name")}</th><th>{t("fields.round")}</th><th>{t("stats.audience")}</th>
						<th>{t("stats.remaining")}</th><th>{t("stats.failed")}</th><th>{t("stats.sent")}</th>
						<th>{t("fields.updated")}</th><th><span className="sr-only">{t("actions")}</span></th></tr></thead>
					<tbody>{campaigns.data.map((campaign) => <tr key={campaign.id}>
						<td><Link className="admin-row-link" href={`/admin/mail/${campaign.id}`}><strong>{campaign.name}</strong></Link></td>
						<td>{roundLabel(campaign.round)}</td><td>{campaign.audienceCount}</td><td>{campaign.remainingCount}</td>
						<td>{campaign.failedCount}</td><td>{campaign.sentCount}</td><td>{formatDate(campaign.updatedAt, locale)}</td>
						<td><Link className="admin-view-link" href={`/admin/mail/${campaign.id}`} aria-label={t("openCampaign", { name: campaign.name })}>
							<ChevronRightIcon /></Link></td></tr>)}</tbody>
				</table></CardContent></Card>}
	</>;
}
