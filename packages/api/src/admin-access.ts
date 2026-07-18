import { db } from "@masc-landing/db";
import { adminEmails } from "@masc-landing/db/schema/index";
import { eq } from "drizzle-orm";

export function normalizeAdminEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getAdminByEmail(email: string) {
  const normalizedEmail = normalizeAdminEmail(email);
  if (!normalizedEmail) return null;

  const [admin] = await db
    .select({ email: adminEmails.email, role: adminEmails.role })
    .from(adminEmails)
    .where(eq(adminEmails.email, normalizedEmail))
    .limit(1);

  return admin ?? null;
}

export async function isAdminEmail(email: string) {
  return (await getAdminByEmail(email)) !== null;
}
