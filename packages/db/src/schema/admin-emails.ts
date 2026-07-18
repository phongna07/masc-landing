import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const adminRoleValues = ["root", "professional"] as const;
export type AdminRole = (typeof adminRoleValues)[number];
export const adminRole = pgEnum("admin_role", adminRoleValues);

export const adminEmails = pgTable(
  "admin_emails",
  {
    email: text("email").primaryKey(),
    role: adminRole("role").default("root").notNull(),
  },
  (table) => [
    check(
      "admin_emails_email_normalized",
      sql`${table.email} <> '' and ${table.email} = lower(btrim(${table.email}))`,
    ),
  ],
);
