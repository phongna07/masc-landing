"use client";

import type { RoundId } from "@masc-landing/api/rounds";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent } from "@masc-landing/ui/components/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArchiveIcon, DownloadIcon, RefreshCwIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { queryClient, trpc } from "@/utils/trpc";
import { formatDate } from "../../admin-state";

export function RoundPdfExport({ round, disabled }: { round: RoundId; disabled: boolean }) {
	const t = useTranslations("Admin.round.bulkExport");
	const locale = useLocale();
	const [actionError, setActionError] = useState<string | null>(null);
	const [wakeError, setWakeError] = useState<string | null>(null);
	const [isWaking, setIsWaking] = useState(false);
	const lastWakeAttempt = useRef<string | null>(null);
	const input = { round };
	const job = useQuery({
		...trpc.admin.getLatestRoundPdfExport.queryOptions(input),
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			return status === "pending" || status === "processing" ? 3_000 : false;
		},
	});
	const createExport = useMutation(trpc.admin.createRoundPdfExport.mutationOptions({
		onSuccess: ({ id, wakeUrl }) => {
			setActionError(null);
			void queryClient.invalidateQueries({ queryKey: trpc.admin.getLatestRoundPdfExport.queryKey(input) });
			void wakeExporter(id, wakeUrl);
		},
		onError: () => setActionError(t("createError")),
	}));
	const download = useMutation(trpc.admin.createRoundPdfExportDownloadUrl.mutationOptions({
		onSuccess: ({ downloadUrl }) => {
			setActionError(null);
			window.location.assign(downloadUrl);
		},
		onError: () => setActionError(t("downloadError")),
	}));

	const data = job.data;
	useEffect(() => {
		if (data?.status !== "pending" || lastWakeAttempt.current === data.id) return;
		void wakeExporter(data.id, data.wakeUrl);
	}, [data?.id, data?.status, data?.wakeUrl]);

	async function wakeExporter(jobId: string, wakeUrl: string | null) {
		lastWakeAttempt.current = jobId;
		setWakeError(null);
		if (!wakeUrl) {
			setWakeError(t("wakeNotConfigured"));
			return;
		}
		setIsWaking(true);
		const controller = new AbortController();
		const timeout = window.setTimeout(() => controller.abort(), 120_000);
		try {
			const response = await fetch(wakeUrl, { cache: "no-store", signal: controller.signal });
			if (!response.ok) throw new Error(`Exporter health check returned ${response.status}`);
			await queryClient.invalidateQueries({ queryKey: trpc.admin.getLatestRoundPdfExport.queryKey(input) });
		} catch {
			setWakeError(t("wakeError"));
		} finally {
			window.clearTimeout(timeout);
			setIsWaking(false);
		}
	}

	const isActive = data?.status === "pending" || data?.status === "processing";
	const isReady = data?.status === "completed" && data.expiresAt && new Date(data.expiresAt) > new Date();
	const status = job.isError
		? t("statusError")
		: !data
			? t("idle")
			: isWaking
				? t("waking")
				: data.status === "pending" && wakeError
					? wakeError
					: isActive
						? t(data.status)
						: isReady
							? t("ready", {
								size: formatBytes(data.archiveBytes ?? data.totalSourceBytes ?? 0, locale),
								expires: formatDate(data.expiresAt!, locale),
							})
							: data.status === "failed"
								? t("failed")
								: t("expired");

	return <Card className="admin-pdf-export-card"><CardContent>
		<div className="admin-pdf-export-copy"><ArchiveIcon aria-hidden="true" /><div><strong>{t("title")}</strong><p>{t("description")}</p>
			{isReady && <span className="admin-pdf-export-count">{t("fileCount", { count: data.fileCount ?? 0 })}</span>}
			<span>{status}</span></div></div>
		<div className="admin-pdf-export-actions">
			{isReady && <Button variant="outline" disabled={download.isPending} onClick={() => download.mutate({ round, exportId: data.id })}>
				<DownloadIcon aria-hidden="true" />{t(download.isPending ? "downloading" : "download")}
			</Button>}
			<Button disabled={disabled || isActive || createExport.isPending} onClick={() => createExport.mutate(input)}>
				{isReady && <RefreshCwIcon aria-hidden="true" />}
				{t(createExport.isPending ? "creating" : isReady ? "recreate" : data?.status === "failed" ? "retry" : "create")}
			</Button>
			{data?.status === "pending" && wakeError && data.wakeUrl && <Button variant="outline" disabled={isWaking} onClick={() => void wakeExporter(data.id, data.wakeUrl)}>
				<RefreshCwIcon aria-hidden="true" />{t("wakeRetry")}
			</Button>}
		</div>
		{actionError && <p className="admin-file-error" role="alert">{actionError}</p>}
	</CardContent></Card>;
}

function formatBytes(bytes: number, locale: string) {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length);
	return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024 ** exponent)} ${units[exponent - 1]}`;
}
