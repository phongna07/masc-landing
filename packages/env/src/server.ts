import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const mailService = process.env.MAIL_SERVICE;
const awsMailCredential = mailService === "aws" ? z.string().min(1) : z.string().min(1).optional();
const resendApiKey = mailService === "resend" ? z.string().min(1) : z.string().min(1).optional();

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
    MAIL_SERVICE: z.enum(["aws", "resend"]),
    MAIL_USERNAME: z.string().email(),
    AWS_ACCESS_KEY_ID: awsMailCredential,
    AWS_SECRET_ACCESS_KEY: awsMailCredential,
    AWS_REGION: awsMailCredential,
    RESEND_API_KEY: resendApiKey,
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
