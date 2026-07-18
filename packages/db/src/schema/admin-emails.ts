import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";

export const adminEmails = pgTable(
  "admin_emails",
  {
    email: text("email").primaryKey(),
  },
  (table) => [
    check(
      "admin_emails_email_normalized",
      sql`${table.email} <> '' and ${table.email} = lower(btrim(${table.email}))`,
    ),
  ],
);
