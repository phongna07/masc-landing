import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    PDF_EXPORTER_URL: z.url().optional(),
    MAIL_USERNAME: z.string().email(),
    MAILEROO_SENDING_KEY: z.string().min(1),
    PRIMARY_EMAIL_SERVICE: z.enum(["zeptomail", "maileroo"]).default("zeptomail"),
    ZEPTOMAIL_URL: z.url(),
    ZEPTOMAIL_TOKEN: z.string().min(1),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
