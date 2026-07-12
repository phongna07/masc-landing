"use client";

import { Button } from "@masc-landing/ui/components/button";
import { roundIds } from "@masc-landing/api/rounds";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

import { AdminError, AdminHeading, AdminLoading } from "./admin-state";

export default function AdminPage() {
	const t = useTranslations("Admin");
	const settings = useQuery(trpc.admin.getSubmissionSettings.queryOptions());
	const update = useMutation(trpc.admin.setRoundSubmissionOpen.mutationOptions({
		onSuccess: async (data) => {
			settings.refetch();
			toast.success(t("overview.success"));
			return data;
		},
		onError: () => toast.error(t("overview.error")),
	}));

	return <>
		<AdminHeading eyebrow={t("eyebrow")} title={t("overview.title")} description={t("overview.description")} />
		{settings.isPending ? <AdminLoading /> : settings.isError ? (
			<AdminError title={t("errors.loadTitle")} description={t("overview.loadError")} retry={() => settings.refetch()} retryLabel={t("actions.retry")} />
		) : <div className="admin-round-settings">
			{roundIds.map((round) => {
				const isOpen = settings.data[round];
				const isUpdating = update.isPending && update.variables?.round === round;
				return <Card className="admin-round-setting" key={round}>
					<CardHeader><div><CardTitle>{t("overview.roundTitle", { round })}</CardTitle><p>{t("overview.roundDescription", { round })}</p></div>
						<span className={isOpen ? "is-open" : "is-closed"}>{t(isOpen ? "overview.open" : "overview.closed")}</span>
					</CardHeader>
					<CardContent><Button
						variant={isOpen ? "default" : "outline"}
						role="switch"
						aria-checked={isOpen}
						disabled={update.isPending}
						onClick={() => update.mutate({ round, isOpen: !isOpen })}
					>{isUpdating ? t("overview.updating") : t(isOpen ? "overview.closeAction" : "overview.openAction")}</Button></CardContent>
				</Card>;
			})}
		</div>}
	</>;
}
