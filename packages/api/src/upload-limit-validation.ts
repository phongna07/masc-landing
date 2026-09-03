import { TRPCError } from "@trpc/server";

export const MEBIBYTE = 1024 * 1024;
export const MIN_UPLOAD_LIMIT_BYTES = MEBIBYTE;
export const MAX_UPLOAD_LIMIT_BYTES = 100 * MEBIBYTE;

export function requireFileWithinUploadLimit(fileSize: number, limit: number) {
	if (!Number.isInteger(fileSize) || fileSize <= 0) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "FILE_EMPTY" });
	}
	if (fileSize > limit) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "FILE_TOO_LARGE" });
	}
}
