import { createDb } from "@masc-landing/db";
import * as schema from "@masc-landing/db/schema/auth";
import { env } from "@masc-landing/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
        strategy: "compact",
        // Revoked sessions may remain valid on non-sensitive cached endpoints for up to five minutes; sensitive operations bypass this cache.
      },
    },
    plugins: [nextCookies()],
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    },
  });
}

export const auth = createAuth();

export function getSession(headers: Headers) {
  return auth.api.getSession({ headers });
}

export function getFreshSession(headers: Headers) {
  return auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
}
