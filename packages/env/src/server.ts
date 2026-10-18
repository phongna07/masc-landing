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
    PAYOS_CLIENT_ID: z.string().min(1).optional(),
    PAYOS_API_KEY: z.string().min(1).optional(),
    PAYOS_CHECKSUM_KEY: z.string().min(1).optional(),
    TICKET_APP_URL: z.url().refine(value => {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
    }, "TICKET_APP_URL must be an HTTP(S) application origin without a path, query, or credentials").optional(),
    TICKET_WORKER_SECRET: z.string().min(32).optional(),
    MAIL_USERNAME: z.string().email(),
    MAIL_REPLY_TO: z.string().email(),
    ZEPTOMAIL_URL: z.url(),
    ZEPTOMAIL_TOKEN: z.string().min(1),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
