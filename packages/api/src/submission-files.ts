import type { RoundId } from "./rounds";

const roundFilenameTokens: Record<RoundId, string> = {
	"0.5": "Preliminary Round Submission",
	"1": "Round 1 Submission",
	"2": "Round 2 Submission",
	"3": "Round 3 Submission",
};

function sanitizeFilenameComponent(value: string) {
	return value.trim().replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g, "_");
}

export function roundSubmissionFilename(teamName: string, round: RoundId) {
	const safeTeamName = sanitizeFilenameComponent(teamName);
	return `MASC'26_${safeTeamName}_${roundFilenameTokens[round]}.pdf`;
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
