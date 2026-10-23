import { createHash, randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@masc-landing/env/server";
import sharp from "sharp";
import { z } from "zod";
import { ticketError } from "./core";

export const maxProofSize = 5 * 1024 * 1024;
export const proofFileInput = z.object({
	filename: z.string().trim().min(1).max(255),
	mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
	fileSize: z.number().int().min(1).max(maxProofSize),
});
export const uploadedProofInput = proofFileInput.extend({ uploadId: z.uuid() });
const client = () => new S3Client({ region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
const rawKey = (actorId: string, uploadId: string) => `sales-proofs/uploads/${createHash("sha256").update(actorId).digest("hex")}/${uploadId}`;

export async function createProofUpload(actorId: string, input: z.infer<typeof proofFileInput>) {
	const uploadId = randomUUID();
	const uploadUrl = await getSignedUrl(client(), new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: rawKey(actorId, uploadId), ContentType: input.mimeType, ContentLength: input.fileSize }), { expiresIn: 300 });
	return { uploadId, uploadUrl };
}

export async function validateProofImage(bytes: Buffer, mimeType: z.infer<typeof proofFileInput>["mimeType"]) {
	if (!bytes.length || bytes.length > maxProofSize) ticketError("invalidProof");
	try {
		const image = sharp(bytes, { limitInputPixels: 20_000_000, animated: false });
		const metadata = await image.metadata();
		const expected = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[mimeType];
		if (metadata.format !== expected || (metadata.pages ?? 1) > 1) ticketError("invalidProof");
		// Re-encode decoded pixels so the permanent proof cannot contain active content or EXIF.
		const normalized = await image.rotate().png().toBuffer();
		if (normalized.length > maxProofSize) ticketError("invalidProof");
		return normalized;
	} catch { ticketError("invalidProof"); }
}

export async function prepareProof(actorId: string, input: z.infer<typeof uploadedProofInput>) {
	const s3 = client();
	const key = rawKey(actorId, input.uploadId);
	try {
		const head = await s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
		if (head.ContentLength !== input.fileSize || head.ContentType !== input.mimeType) ticketError("invalidProof");
		const object = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
		if (!object.Body) ticketError("invalidProof");
		const chunks: Buffer[] = [];
		let length = 0;
		for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
			length += chunk.length;
			if (length > maxProofSize) ticketError("invalidProof");
			chunks.push(Buffer.from(chunk));
		}
		if (length !== input.fileSize) ticketError("invalidProof");
		const image = await validateProofImage(Buffer.concat(chunks), input.mimeType);
		const objectKey = `sales-proofs/validated/${randomUUID()}.png`;
		await s3.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: objectKey, Body: image, ContentType: "image/png" }));
		return { objectKey, filename: input.filename, uploadId: input.uploadId };
	} catch { ticketError("invalidProof"); }
}

export async function deleteProof(objectKey: string) {
	try { await client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: objectKey })); } catch { /* Cleanup must not invalidate an issued ticket. */ }
}

export async function deleteStagedProof(actorId: string, uploadId: string) {
	await deleteProof(rawKey(actorId, uploadId));
}

export async function proofPreviewUrl(objectKey: string) {
	return getSignedUrl(client(), new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: objectKey, ResponseContentType: "image/png", ResponseContentDisposition: 'inline; filename="transaction-proof.png"', ResponseCacheControl: "private, no-store" }), { expiresIn: 300 });
}
