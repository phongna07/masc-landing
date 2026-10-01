"use client";

import { MAX_PROBLEM_STATEMENT_FILE_SIZE } from "@masc-landing/api/round-one-problem-statements";
import { problemStatementFileSchema, type ProblemStatementRound } from "@masc-landing/api/round-problem-statements";
import { Button } from "@masc-landing/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@masc-landing/ui/components/card";
import { ConfirmationDialog } from "@masc-landing/ui/components/confirmation-dialog";
import { Label } from "@masc-landing/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DownloadIcon, FileTextIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";

import FileInput from "@/components/file-input";
import { useRoundLabel } from "@/hooks/use-round-label";
import { trpc } from "@/utils/trpc";
import { AdminError, AdminLoading } from "../../admin-state";

export default function RoundProblemStatementsSection() {
	const t = useTranslations("Admin");
	const metadata = useQuery(trpc.roundProblemStatement.adminMetadata.queryOptions());
	const publication = useQuery(trpc.admin.getProblemStatementPublicationSettings.queryOptions());
	return <section className="admin-setting-section" aria-labelledby="later-round-problem-statements-title">
		<div className="admin-setting-section-heading">
			<h2 id="later-round-problem-statements-title">{t("overview.roundProblemStatements.title")}</h2>
			<p>{t("overview.roundProblemStatements.description")}</p>
		</div>
		{metadata.isPending || publication.isPending ? <AdminLoading /> : metadata.isError || publication.isError ?
			<AdminError title={t("errors.loadTitle")} description={t("overview.roundProblemStatements.loadError")}
				retry={() => { void metadata.refetch(); void publication.refetch(); }} retryLabel={t("actions.retry")} /> :
			<div className="admin-round-problem-statements">{(["2", "3"] as const).map((round) =>
				<RoundProblemStatementControls key={round} round={round} statement={metadata.data[round]}
					isPublished={publication.data[round]} onFileChanged={() => metadata.refetch()}
					onPublicationChanged={() => publication.refetch()} />)}</div>}
	</section>;
}

function RoundProblemStatementControls({ round, statement, isPublished, onFileChanged, onPublicationChanged }: {
	round: ProblemStatementRound;
	statement: { originalFilename: string; fileSize: number } | null;
	isPublished: boolean;
	onFileChanged: () => Promise<unknown>;
	onPublicationChanged: () => Promise<unknown>;
}) {
	const t = useTranslations("Admin");
	const roundLabel = useRoundLabel()(round);
	const [file, setFile] = useState<File | null>(null);
	const [fileError, setFileError] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const inputId = `round-${round}-problem-statement`;
	const createUploadUrl = useMutation(trpc.roundProblemStatement.createUploadUrl.mutationOptions());
	const replace = useMutation(trpc.roundProblemStatement.replace.mutationOptions());
	const download = useMutation(trpc.roundProblemStatement.createAdminDownloadUrl.mutationOptions({
		onSuccess: ({ downloadUrl }) => window.location.assign(downloadUrl),
		onError: () => toast.error(t("overview.preferences.problemStatement.downloadError")),
	}));
	const remove = useMutation(trpc.roundProblemStatement.remove.mutationOptions({
		onSuccess: async () => { await onFileChanged(); toast.success(t("overview.preferences.problemStatement.deleteSuccess")); },
		onError: () => toast.error(t("overview.preferences.problemStatement.deleteError")),
	}));
	const publication = useMutation(trpc.admin.setProblemStatementPublished.mutationOptions({
		onSuccess: async () => { await onPublicationChanged(); toast.success(t("overview.roundProblemStatements.publicationSuccess")); },
		onError: () => toast.error(t("overview.preferences.publication.error")),
	}));
	const disabled = isUploading || remove.isPending;
	const upload = async () => {
		setFileError(null);
		if (!file) return setFileError(t("overview.preferences.problemStatement.validation.required"));
		if (!file.name.toLowerCase().endsWith(".pdf") || file.type !== "application/pdf") {
			return setFileError(t("overview.roundProblemStatements.invalidType"));
		}
		if (file.size <= 0) return setFileError(t("overview.preferences.problemStatement.validation.empty"));
		if (file.size > MAX_PROBLEM_STATEMENT_FILE_SIZE) return setFileError(t("overview.preferences.problemStatement.validation.size"));
		const parsed = problemStatementFileSchema.safeParse({ round, filename: file.name, mimeType: file.type, fileSize: file.size });
		if (!parsed.success) return setFileError(t("overview.preferences.problemStatement.uploadError"));
		setIsUploading(true);
		try {
			const signed = await createUploadUrl.mutateAsync(parsed.data);
			const response = await fetch(signed.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
			if (!response.ok) throw new Error("UPLOAD_FAILED");
			await replace.mutateAsync({ ...parsed.data, uploadId: signed.uploadId });
			setFile(null);
			if (fileInputRef.current) fileInputRef.current.value = "";
			await onFileChanged();
			toast.success(t("overview.preferences.problemStatement.uploadSuccess"));
		} catch {
			setFileError(t("overview.preferences.problemStatement.uploadError"));
		} finally {
			setIsUploading(false);
		}
	};
	return <>
		<Card className="admin-round-setting">
			<CardHeader><CardTitle>{t("overview.roundProblemStatements.uploadTitle", { roundLabel })}</CardTitle></CardHeader>
			<CardContent><div className="admin-problem-statement">
				<div className="admin-problem-statement-heading">
					<div><Label htmlFor={inputId}>{t("overview.preferences.problemStatement.label")}</Label>
						<span className="field-hint">{t("overview.preferences.problemStatement.hint")}</span></div>
					{statement && <div className="admin-problem-statement-current"><FileTextIcon aria-hidden="true" />
						<div><strong title={statement.originalFilename}>{statement.originalFilename}</strong><span>{statement.fileSize < 1024 * 1024
							? `${Math.ceil(statement.fileSize / 1024)} KiB` : `${(statement.fileSize / (1024 * 1024)).toFixed(1)} MiB`}</span></div>
						<Button type="button" size="sm" variant="outline" disabled={disabled || download.isPending} onClick={() => download.mutate({ round })}>
							<DownloadIcon aria-hidden="true" />{t("overview.preferences.problemStatement.download")}</Button>
					</div>}
				</div>
				<div className="admin-problem-statement-controls">
					<FileInput ref={fileInputRef} id={inputId} selectedFileName={file?.name} accept=".pdf,application/pdf" disabled={disabled}
						onChange={(event) => { setFile(event.target.files?.[0] ?? null); setFileError(null); }} />
					<Button type="button" variant="outline" disabled={disabled || !file} onClick={() => void upload()}>
						<UploadIcon aria-hidden="true" />{t(isUploading ? "overview.preferences.problemStatement.uploading"
							: statement ? "overview.preferences.problemStatement.replace" : "overview.preferences.problemStatement.upload")}</Button>
					{statement && <ConfirmationDialog
						trigger={<Button type="button" variant="destructive" disabled={disabled}><Trash2Icon aria-hidden="true" />{t("overview.preferences.problemStatement.delete")}</Button>}
						title={t("overview.preferences.problemStatement.deleteConfirmation.title")}
						description={t("overview.roundProblemStatements.deleteDescription", { roundLabel })}
						confirmLabel={t("overview.preferences.problemStatement.deleteConfirmation.confirm")} cancelLabel={t("actions.cancel")}
						icon={<Trash2Icon />} tone="destructive" onConfirm={() => remove.mutate({ round })} />}
				</div>
				{fileError && <p className="admin-file-error" role="alert">{fileError}</p>}
			</div></CardContent>
		</Card>
		<Card className="admin-round-setting admin-problem-publication">
			<CardHeader><div><CardTitle>{t("overview.roundProblemStatements.publishTitle", { roundLabel })}</CardTitle>
				<p>{t("overview.roundProblemStatements.publishDescription", { roundLabel })}</p></div>
				<span className={isPublished ? "is-open" : "is-closed"}>{t(isPublished ? "overview.preferences.publication.published" : "overview.preferences.publication.unpublished")}</span>
			</CardHeader>
			<CardContent><Button type="button" role="switch" aria-checked={isPublished} disabled={disabled || publication.isPending}
				onClick={() => publication.mutate({ round, isPublished: !isPublished })}>
				{publication.isPending ? t("overview.updating") : t(isPublished ? "overview.roundProblemStatements.unpublish" : "overview.roundProblemStatements.publish", { roundLabel })}
			</Button></CardContent>
		</Card>
	</>;
}
