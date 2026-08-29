"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { AdminHeading } from "../../admin-state";
import CampaignEditor, { emptyMailCampaign } from "../campaign-editor";

export default function NewMailCampaignPage() {
	const t = useTranslations("Admin.mail");
	return <>
		<Link className="admin-back-link" href="/admin/mail"><ArrowLeftIcon />{t("back")}</Link>
		<AdminHeading eyebrow={t("eyebrow")} title={t("newTitle")} description={t("newDescription")} />
		<CampaignEditor initial={emptyMailCampaign} />
	</>;
}
