"use client";

import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@masc-landing/ui/components/dialog";
import { useQuery } from "@tanstack/react-query";
import { FileTextIcon, MaximizeIcon, MinimizeIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import type { ProblemStatementRound } from "@masc-landing/api/round-problem-statements";
import { useRoundLabel } from "@/hooks/use-round-label";
import { trpc } from "@/utils/trpc";

type Statement = { originalFilename: string; fileSize: number; previewUrl: string; description?: string | null };

export function ProblemStatementPreview({ statement }: { statement: Statement }) {
	const t = useTranslations("Dashboard");
	const previewRef = useRef<HTMLDivElement>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	useEffect(() => {
		const onChange = () => setIsFullscreen(document.fullscreenElement === previewRef.current);
		document.addEventListener("fullscreenchange", onChange);
		return () => document.removeEventListener("fullscreenchange", onChange);
	}, []);
	const fullscreen = async () => {
		if (isFullscreen) {
			try { await document.exitFullscreen(); } catch {
				setIsFullscreen(document.fullscreenElement === previewRef.current);
			}
			return;
		}
		try {
			if (!previewRef.current?.requestFullscreen) throw new Error("FULLSCREEN_UNAVAILABLE");
			await previewRef.current.requestFullscreen();
		} catch {
			setDialogOpen(true);
		}
	};
	const title = t("preferences.problemStatement.iframeTitle", { filename: statement.originalFilename });
	return <section className="assigned-problem-statement" aria-label={t("preferences.problemStatement.label")}>
		{statement.description && <div className="problem-statement-description" dangerouslySetInnerHTML={{ __html: statement.description }} />}
		<div className="submission-file problem-statement-file"><FileTextIcon aria-hidden="true" />
			<div><strong>{statement.originalFilename}</strong><span>{statement.fileSize < 1024 * 1024
				? `${Math.ceil(statement.fileSize / 1024)} KiB` : `${(statement.fileSize / (1024 * 1024)).toFixed(1)} MiB`}</span></div>
		</div>
		<div ref={previewRef} className="submission-preview problem-statement-preview">
			<div className="problem-statement-preview-heading"><span>{t("preferences.problemStatement.label")}</span>
				<Button type="button" size="sm" variant="outline" onClick={() => void fullscreen()}>
					{isFullscreen ? <MinimizeIcon aria-hidden="true" /> : <MaximizeIcon aria-hidden="true" />}
					{t(isFullscreen ? "problemStatement.exitFullscreen" : "problemStatement.fullscreen")}
				</Button>
			</div>
			<iframe src={statement.previewUrl} title={title} allowFullScreen allow="fullscreen" />
		</div>
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			<DialogContent className="problem-statement-fullscreen-dialog">
				<div className="problem-statement-preview-heading"><DialogTitle>{t("preferences.problemStatement.label")}</DialogTitle>
					<DialogClose render={<Button type="button" size="sm" variant="outline" />}>
						<XIcon aria-hidden="true" />{t("problemStatement.exitFullscreen")}
					</DialogClose>
				</div>
				<DialogDescription className="sr-only">{title}</DialogDescription>
				<iframe src={statement.previewUrl} title={title} allowFullScreen allow="fullscreen" />
			</DialogContent>
		</Dialog>
	</section>;
}

export default function RoundProblemStatement({ round }: { round: ProblemStatementRound }) {
	const t = useTranslations("Dashboard");
	const roundLabel = useRoundLabel()(round);
	const statement = useQuery(trpc.roundProblemStatement.current.queryOptions({ round }));
	return <Card className="dashboard-card">
		<CardHeader><CardTitle>{t("problemStatement.title", { roundLabel })}</CardTitle></CardHeader>
		<CardContent>
			{statement.isPending ? <p className="problem-statement-message">{t("preferences.problemStatement.loading")}</p>
				: statement.isError ? <div className="problem-statement-message problem-statement-error">
					<p>{t("errors.loadDescription")}</p>
					<Button type="button" size="sm" variant="outline" onClick={() => void statement.refetch()}>
						<RefreshCwIcon aria-hidden="true" />{t("preferences.problemStatement.retry")}
					</Button>
				</div> : statement.data ? <ProblemStatementPreview statement={statement.data} />
					: <p className="problem-statement-message">{t("preferences.problemStatement.unavailable")}</p>}
		</CardContent>
	</Card>;
}
