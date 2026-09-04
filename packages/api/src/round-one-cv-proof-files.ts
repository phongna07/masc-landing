export const MAX_ROUND_ONE_CV_PROOFS_PER_MEMBER = 10;
export const MIN_ROUND_ONE_CV_PROOF_MEMBERS = 2;

export function countRoundOneCvProofMembers(proofFilesByMember: readonly (readonly unknown[])[]) {
	return proofFilesByMember.filter((files) => files.length > 0).length;
}

export const ROUND_ONE_CV_PROOF_ACCEPT = [
	"image/*",
	".pdf",
	".doc",
	".docx",
	".xls",
	".xlsx",
	".ppt",
	".pptx",
].join(",");

const officeMimeTypes = {
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	ppt: "application/vnd.ms-powerpoint",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

export type RoundOneCvProofKind = "image" | "pdf" | "office";

function filenameExtension(filename: string) {
	const match = /\.([a-zA-Z0-9]{1,16})$/.exec(filename.trim());
	return match?.[1]?.toLowerCase() ?? "";
}

export function roundOneCvProofFileInfo(filename: string, suppliedMimeType: string) {
	const extension = filenameExtension(filename);
	if (extension === "pdf") {
		return { extension, mimeType: "application/pdf", kind: "pdf" as const };
	}
	if (extension in officeMimeTypes) {
		return {
			extension,
			mimeType: officeMimeTypes[extension as keyof typeof officeMimeTypes],
			kind: "office" as const,
		};
	}
	const mimeType = suppliedMimeType.trim().toLowerCase();
	if (mimeType.startsWith("image/") && mimeType.length <= 255) {
		return { extension: extension || "image", mimeType, kind: "image" as const };
	}
	return null;
}

export function isRoundOneCvProofOfficeFile(filename: string) {
	return roundOneCvProofFileInfo(filename, "")?.kind === "office";
}
