import { db } from "@masc-landing/db";
import { adminEmails } from "@masc-landing/db/schema/index";
import { eq } from "drizzle-orm";

export function normalizeAdminEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function isAdminEmail(email: string) {
  const normalizedEmail = normalizeAdminEmail(email);
  if (!normalizedEmail) return false;

  const [admin] = await db
    .select({ email: adminEmails.email })
    .from(adminEmails)
    .where(eq(adminEmails.email, normalizedEmail))
    .limit(1);

  return admin !== undefined;
}
