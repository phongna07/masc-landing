import { db } from "@masc-landing/db";
import { uploadLimitSettings } from "@masc-landing/db/schema/index";
import { TRPCError } from "@trpc/server";

export const MEBIBYTE = 1024 * 1024;
export const MIN_UPLOAD_LIMIT_BYTES = MEBIBYTE;
export const MAX_UPLOAD_LIMIT_BYTES = 100 * MEBIBYTE;

export const uploadLimitKinds = ["participantCv", "roundSubmission"] as const;
export type UploadLimitKind = (typeof uploadLimitKinds)[number];
export type UploadLimits = Record<UploadLimitKind, number>;

export const defaultUploadLimits: UploadLimits = {
	participantCv: 10 * MEBIBYTE,
	roundSubmission: 20 * MEBIBYTE,
};

export const uploadLimitDatabaseKinds = {
	participantCv: "participant_cv",
	roundSubmission: "round_submission",
} as const satisfies Record<UploadLimitKind, string>;

const databaseUploadLimitKinds = Object.fromEntries(
	Object.entries(uploadLimitDatabaseKinds).map(([kind, databaseKind]) => [databaseKind, kind]),
) as Record<string, UploadLimitKind>;

export async function getUploadLimits(): Promise<UploadLimits> {
	const rows = await db.select({ kind: uploadLimitSettings.kind, maxFileSize: uploadLimitSettings.maxFileSize })
		.from(uploadLimitSettings);
	const limits = { ...defaultUploadLimits };
	for (const row of rows) {
		const kind = databaseUploadLimitKinds[row.kind];
		if (kind) limits[kind] = row.maxFileSize;
	}
	return limits;
}

export function requireFileWithinUploadLimit(fileSize: number, limit: number) {
	if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > limit) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "FILE_TOO_LARGE" });
	}
}

export async function requireCurrentUploadLimit(kind: UploadLimitKind, fileSize: number) {
	const limits = await getUploadLimits();
	requireFileWithinUploadLimit(fileSize, limits[kind]);
	return limits[kind];
}
