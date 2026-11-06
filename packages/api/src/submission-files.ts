import type { RoundId } from "./rounds";

export const roundSubmissionMimeTypes = {
	".pdf": "application/pdf",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

export type RoundSubmissionExtension = keyof typeof roundSubmissionMimeTypes;

export const roundSubmissionAccept = Object.entries(roundSubmissionMimeTypes)
	.flatMap(([extension, mimeType]) => [extension, mimeType]).join(",");

export function roundSubmissionExtension(filename: string): RoundSubmissionExtension | null {
	const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
	return extension === ".pdf" || extension === ".pptx" ? extension : null;
}

const roundFilenameTokens: Record<RoundId, string> = {
	"0.5": "Preliminary Round Submission",
	"1": "Round 1 Submission",
	"2": "Round 2 Submission",
	"3": "Practical Round Submission",
	"4": "Mini Case Submission",
	"5": "Final Slide Presentation Submission",
};

function sanitizeFilenameComponent(value: string) {
	return value.trim().replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, "_");
}

export function roundSubmissionFilename(teamName: string, round: RoundId, extension: RoundSubmissionExtension = ".pdf") {
	const safeTeamName = sanitizeFilenameComponent(teamName);
	return `MASC'26_${safeTeamName}_${roundFilenameTokens[round]}${extension}`;
}

export function roundSubmissionArchiveFilename(round: RoundId) {
	return `MASC'26_${roundFilenameTokens[round]}s.zip`;
}

function encodeRfc5987Value(value: string) {
	return encodeURIComponent(value).replace(/['()*]/g, (character) =>
		`%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

export function attachmentContentDisposition(filename: string) {
	const safeFilename = sanitizeFilenameComponent(filename);
	const asciiFallback = safeFilename.replace(/[^\x20-\x7E]|["\\]/g, "_");
	return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987Value(safeFilename)}`;
}
