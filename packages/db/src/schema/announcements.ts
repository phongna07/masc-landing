import { bigint, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const announcements = pgTable(
  "announcements",
  {
    id: text("id").$defaultFn(() => crypto.randomUUID()).primaryKey(),
    content: text("content").notNull(),
    objectKey: text("object_key"),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    fileSize: bigint("file_size", { mode: "number" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("announcements_created_at_idx").on(table.createdAt)],
);
