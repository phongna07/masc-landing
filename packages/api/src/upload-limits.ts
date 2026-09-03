import { db } from "@masc-landing/db";
import { uploadLimitSettings } from "@masc-landing/db/schema/index";

import {
	MEBIBYTE,
	requireFileWithinUploadLimit,
} from "./upload-limit-validation";

export {
	MAX_UPLOAD_LIMIT_BYTES,
	MEBIBYTE,
	MIN_UPLOAD_LIMIT_BYTES,
	requireFileWithinUploadLimit,
} from "./upload-limit-validation";

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

export async function requireCurrentUploadLimit(kind: UploadLimitKind, fileSize: number) {
	const limits = await getUploadLimits();
	requireFileWithinUploadLimit(fileSize, limits[kind]);
	return limits[kind];
}
