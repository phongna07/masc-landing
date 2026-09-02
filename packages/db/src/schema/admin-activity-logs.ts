import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type AdminActivityLogInput = null | boolean | number | string | AdminActivityLogInput[] | {
  [key: string]: AdminActivityLogInput;
};

export const adminActivityLogs = pgTable(
  "admin_activity_logs",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    actorName: text("actor_name").notNull(),
    actorEmail: text("actor_email").notNull(),
    actorRole: text("actor_role").notNull(),
    procedurePath: text("procedure_path").notNull(),
    procedureType: text("procedure_type").notNull(),
    input: jsonb("input").$type<AdminActivityLogInput>(),
    outcome: text("outcome").notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { precision: 3 }).defaultNow().notNull(),
  },
  (table) => [index("admin_activity_logs_created_at_id_idx").on(table.createdAt, table.id)],
);
