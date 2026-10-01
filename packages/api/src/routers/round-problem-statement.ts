import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@masc-landing/db";
import { roundProblemStatements } from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { adminAreaProcedure, freshProtectedProcedure, protectedProcedure, router } from "../index";
import { getProblemStatementPublicationSettings } from "../problem-statement-publication-settings";
import { getRoundMembership } from "../registration-memberships";
import { completeProblemStatementUpload, isAdmittedToProblemStatementRound, problemStatementFileSchema, problemStatementRoundSchema, type ProblemStatementRound } from "../round-problem-statements";
import { attachmentContentDisposition } from "../submission-files";

const URL_EXPIRY_SECONDS = 300;
const overviewProcedure = adminAreaProcedure("overview");
const roundInput = z.object({ round: problemStatementRoundSchema });
const s3 = new S3Client({
	region: "auto",
	endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

function objectKey(round: ProblemStatementRound, uploadId: string) {
	return `round-${round}-problem-statements/${uploadId}.pdf`;
}

async function deleteObject(key: string) {
	await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}

async function statementFor(round: ProblemStatementRound) {
	const [statement] = await db.select().from(roundProblemStatements)
		.where(eq(roundProblemStatements.round, round)).limit(1);
	return statement ?? null;
}

export const roundProblemStatementRouter = router({
	publicationSettings: protectedProcedure.query(getProblemStatementPublicationSettings),
	adminMetadata: overviewProcedure.query(async () => {
		const rows = await db.select({ round: roundProblemStatements.round,
			originalFilename: roundProblemStatements.originalFilename, fileSize: roundProblemStatements.fileSize,
		}).from(roundProblemStatements);
		const metadata: Record<ProblemStatementRound, { originalFilename: string; fileSize: number } | null> = { "2": null, "3": null };
		for (const row of rows) {
			if (row.round === "2" || row.round === "3") metadata[row.round] = { originalFilename: row.originalFilename, fileSize: row.fileSize };
		}
		return metadata;
	}),
	createUploadUrl: overviewProcedure.input(problemStatementFileSchema).mutation(async ({ input }) => {
		const uploadId = crypto.randomUUID();
		const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
			Bucket: env.R2_BUCKET, Key: objectKey(input.round, uploadId), ContentType: input.mimeType, ContentLength: input.fileSize,
		}), { expiresIn: URL_EXPIRY_SECONDS });
		return { uploadId, uploadUrl, expiresIn: URL_EXPIRY_SECONDS };
	}),
	replace: overviewProcedure.input(problemStatementFileSchema.extend({ uploadId: z.uuid() })).mutation(async ({ input }) => {
		const key = objectKey(input.round, input.uploadId);
		const existing = await statementFor(input.round);
		const values = { round: input.round, objectKey: key, originalFilename: input.filename,
			mimeType: input.mimeType, fileSize: input.fileSize, updatedAt: new Date() };
		await completeProblemStatementUpload({ objectKey: key, previousObjectKey: existing?.objectKey ?? null, fileSize: input.fileSize }, {
			head: () => s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key })),
			persist: () => db.insert(roundProblemStatements).values(values)
				.onConflictDoUpdate({ target: roundProblemStatements.round, set: values }),
			delete: deleteObject,
		});
		return { success: true };
	}),
	remove: overviewProcedure.input(roundInput).mutation(async ({ input }) => {
		const [removed] = await db.delete(roundProblemStatements).where(eq(roundProblemStatements.round, input.round))
			.returning({ objectKey: roundProblemStatements.objectKey });
		if (removed) {
			try { await deleteObject(removed.objectKey); } catch { /* Removal survives R2 cleanup failure. */ }
		}
		return { success: true };
	}),
	createAdminDownloadUrl: overviewProcedure.input(roundInput).mutation(async ({ input }) => {
		const statement = await statementFor(input.round);
		if (!statement) throw new TRPCError({ code: "NOT_FOUND", message: "PROBLEM_STATEMENT_NOT_FOUND" });
		const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
			Bucket: env.R2_BUCKET, Key: statement.objectKey, ResponseContentType: "application/pdf",
			ResponseContentDisposition: attachmentContentDisposition(statement.originalFilename),
		}), { expiresIn: URL_EXPIRY_SECONDS });
		return { downloadUrl };
	}),
	current: freshProtectedProcedure.input(roundInput).query(async ({ ctx, input }) => {
		const membership = await getRoundMembership(ctx.session.user, input.round);
		if (!isAdmittedToProblemStatementRound(input.round, membership)) {
			throw new TRPCError({ code: "FORBIDDEN", message: "TEAM_NOT_APPROVED" });
		}
		const publication = await getProblemStatementPublicationSettings();
		if (!publication[input.round]) return null;
		const statement = await statementFor(input.round);
		if (!statement) return null;
		const previewUrl = await getSignedUrl(s3, new GetObjectCommand({
			Bucket: env.R2_BUCKET, Key: statement.objectKey,
			ResponseContentType: "application/pdf", ResponseContentDisposition: "inline",
		}), { expiresIn: URL_EXPIRY_SECONDS });
		return { originalFilename: statement.originalFilename, fileSize: statement.fileSize, previewUrl };
	}),
});
