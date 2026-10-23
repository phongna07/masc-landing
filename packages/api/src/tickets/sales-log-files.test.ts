import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const objects = new Map<string, { bytes: Buffer; type: string; size?: number }>();
const requests: { name: string; input: Record<string, unknown> }[] = [];
mock.module("@masc-landing/env/server", { namedExports: { env: { R2_BUCKET: "private-test", R2_ACCOUNT_ID: "test", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test" } } });
mock.module("@aws-sdk/client-s3", { namedExports: {
	GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand,
	S3Client: class {
		async send(command: { input: Record<string, unknown>; constructor: { name: string } }) {
			requests.push({ name: command.constructor.name, input: command.input });
			const key = String(command.input.Key);
			if (command instanceof PutObjectCommand) { objects.set(key, { bytes: Buffer.from(command.input.Body as Buffer), type: String(command.input.ContentType) }); return {}; }
			if (command instanceof DeleteObjectCommand) { objects.delete(key); return {}; }
			const object = objects.get(key); if (!object) throw new Error("Not found");
			if (command instanceof HeadObjectCommand) return { ContentLength: object.size ?? object.bytes.length, ContentType: object.type };
			return { Body: (async function* () { yield object.bytes; })() };
		}
	},
} });
mock.module("@aws-sdk/s3-request-presigner", { namedExports: {
	getSignedUrl: async (_client: unknown, command: { input: Record<string, unknown>; constructor: { name: string } }, options: { expiresIn: number }) => { requests.push({ name: command.constructor.name, input: { ...command.input, expiresIn: options.expiresIn } }); return "https://private.test/signed"; },
} });
// Only ticketError is needed; no configured database may be loaded by this unit test.
mock.module(new URL("./core.ts", import.meta.url).href, { namedExports: { ticketError: (message: string) => { throw new Error(message); } } });
const { createProofUpload, prepareProof, proofFileInput, validateProofImage, proofPreviewUrl } = await import("./sales-log-files");
const rawKey = (actor: string, id: string) => `sales-proofs/uploads/${createHash("sha256").update(actor).digest("hex")}/${id}`;
beforeEach(() => { objects.clear(); requests.length = 0; });

test("presigned uploads bind keys to the creator, MIME and size with a five-minute expiry", async () => {
	const result = await createProofUpload("creator", { filename: "proof.png", mimeType: "image/png", fileSize: 100 });
	assert.equal(requests[0]?.input.Key, rawKey("creator", result.uploadId));
	assert.equal(requests[0]?.input.ContentType, "image/png");
	assert.equal(requests[0]?.input.ContentLength, 100);
	assert.equal(requests[0]?.input.expiresIn, 300);
	for (const input of [{ mimeType: "image/svg+xml", fileSize: 1 }, { mimeType: "application/pdf", fileSize: 1 }, { mimeType: "image/png", fileSize: 5 * 1024 * 1024 + 1 }]) assert.equal(proofFileInput.safeParse({ filename: "proof", ...input }).success, false);
});

test("JPEG, PNG and WebP bytes are decoded and re-encoded as immutable PNG proofs", async () => {
	for (const format of ["jpeg", "png", "webp"] as const) {
		const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).toFormat(format).toBuffer();
		const id = randomUUID();
		objects.set(rawKey("creator", id), { bytes, type: `image/${format}` });
		const proof = await prepareProof("creator", { uploadId: id, filename: `proof.${format}`, mimeType: `image/${format}`, fileSize: bytes.length });
		assert.match(proof.objectKey, /^sales-proofs\/validated\/[a-f0-9-]+\.png$/);
		const stored = objects.get(proof.objectKey)!;
		assert.equal(stored.type, "image/png");
		assert.equal((await sharp(stored.bytes).metadata()).format, "png");
		assert.notEqual(proof.objectKey, rawKey("creator", id));
	}
});

test("cross-creator uploads, forged metadata, corrupt images and MIME disguises fail", async () => {
	const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).png().toBuffer();
	const id = randomUUID();
	const input = { uploadId: id, filename: "proof.png", mimeType: "image/png" as const, fileSize: bytes.length };
	objects.set(rawKey("creator", id), { bytes, type: "image/png" });
	await assert.rejects(prepareProof("another-creator", input), /invalidProof/);
	await assert.rejects(prepareProof("creator", { ...input, fileSize: bytes.length + 1 }), /invalidProof/);
	await assert.rejects(prepareProof("creator", { ...input, mimeType: "image/jpeg" }), /invalidProof/);
	await assert.rejects(validateProofImage(Buffer.from("<svg></svg>"), "image/png"), /invalidProof/);
	await assert.rejects(validateProofImage(bytes, "image/jpeg"), /invalidProof/);
	objects.set(rawKey("creator", id), { bytes: Buffer.from("corrupt"), size: bytes.length, type: "image/png" });
	await assert.rejects(prepareProof("creator", input), /invalidProof/);
	assert.equal(requests.filter(request => request.name === "PutObjectCommand").length, 0);
});

test("preview URLs are private, short-lived, and explicitly image-only", async () => {
	await proofPreviewUrl("sales-proofs/validated/proof.png");
	assert.equal(requests[0]?.input.expiresIn, 300);
	assert.equal(requests[0]?.input.ResponseContentType, "image/png");
	assert.equal(requests[0]?.input.ResponseCacheControl, "private, no-store");
});
