import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@masc-landing/db";
import { announcements } from "@masc-landing/db/schema/index";
import { env } from "@masc-landing/env/server";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { adminAreaProcedure, protectedProcedure, router } from "../index";

const announcementsAdminProcedure = adminAreaProcedure("announcements");

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const URL_EXPIRY_SECONDS = 300;
const allowedImages: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const imageInput = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(160),
  fileSize: z.number().int().positive().max(MAX_IMAGE_SIZE),
});
const optionalImageInput = z.object({
  uploadId: z.uuid(),
  filename: imageInput.shape.filename,
  mimeType: imageInput.shape.mimeType,
  fileSize: imageInput.shape.fileSize,
});

function extensionOf(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot).toLowerCase();
}

function validateImage(image: z.infer<typeof imageInput>) {
  const extension = extensionOf(image.filename);
  if (allowedImages[extension] !== image.mimeType) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "UNSUPPORTED_IMAGE" });
  }
  return extension;
}

function objectKey(uploadId: string, extension: string) {
  return `announcements/${uploadId}${extension}`;
}

async function bestEffortDelete(key: string) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  } catch {
    // R2 cleanup must not make an already completed database operation fail.
  }
}

export const announcementsRouter = router({
  list: protectedProcedure.query(async () => {
    const rows = await db.select().from(announcements).orderBy(desc(announcements.createdAt));
    return Promise.all(rows.map(async ({ objectKey: key, ...announcement }) => ({
      ...announcement,
      imageUrl: key && announcement.mimeType
        ? await getSignedUrl(s3, new GetObjectCommand({
            Bucket: env.R2_BUCKET,
            Key: key,
            ResponseContentType: announcement.mimeType,
            ResponseContentDisposition: "inline",
          }), { expiresIn: URL_EXPIRY_SECONDS })
        : null,
    })));
  }),

  createUploadUrl: announcementsAdminProcedure.input(imageInput).mutation(async ({ input }) => {
    const extension = validateImage(input);
    const uploadId = crypto.randomUUID();
    const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: objectKey(uploadId, extension),
      ContentType: input.mimeType,
      ContentLength: input.fileSize,
    }), { expiresIn: URL_EXPIRY_SECONDS });
    return { uploadId, uploadUrl, expiresIn: URL_EXPIRY_SECONDS };
  }),

  create: announcementsAdminProcedure.input(z.object({
    content: z.string().trim().min(1).max(5000),
    image: optionalImageInput.nullish(),
  })).mutation(async ({ input }) => {
    let image: { objectKey: string; originalFilename: string; mimeType: string; fileSize: number } | undefined;
    if (input.image) {
      const key = objectKey(input.image.uploadId, validateImage(input.image));
      let object;
      try {
        object = await s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_NOT_FOUND" });
      }
      if (object.ContentLength !== input.image.fileSize || object.ContentType !== input.image.mimeType) {
        await bestEffortDelete(key);
        throw new TRPCError({ code: "BAD_REQUEST", message: "UPLOAD_MISMATCH" });
      }
      image = { objectKey: key, originalFilename: input.image.filename, mimeType: input.image.mimeType, fileSize: input.image.fileSize };
    }

    try {
      const [created] = await db.insert(announcements).values({ content: input.content, ...image }).returning({ id: announcements.id });
      return { id: created!.id };
    } catch (error) {
      if (image) await bestEffortDelete(image.objectKey);
      throw error;
    }
  }),

  delete: announcementsAdminProcedure.input(z.object({ id: z.string().trim().min(1).max(128) })).mutation(async ({ input }) => {
    const [deleted] = await db.delete(announcements).where(eq(announcements.id, input.id)).returning({ objectKey: announcements.objectKey });
    if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "ANNOUNCEMENT_NOT_FOUND" });
    if (deleted.objectKey) await bestEffortDelete(deleted.objectKey);
    return { success: true };
  }),
});
