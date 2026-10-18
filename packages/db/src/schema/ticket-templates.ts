import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";

export type TicketTemplatePalette = {
	background: string; surface: string; border: string; text: string; muted: string;
	accent: string; highlight: string; highlightBackground: string;
	normal: string; vip: string; valid: string; revoked: string;
};
export type TicketTemplateCopyKey = "admissionQr" | "normal" | "vip" | "networkingLunch" | "confidential" | "code" | "validity" | "valid" | "revoked" | "subject" | "giftSubject" | "intro" | "giftIntro" | "attachments" | "package" | "quantity" | "total" | "order" | "revokedNotice";
export type TicketTemplateConfig = {
	artwork: { brand: string; palette: TicketTemplatePalette; headingFont: "serif" | "sans"; titleSize: number; bodySize: number };
	email: { brand: string; palette: TicketTemplatePalette; headingFont: "serif" | "sans"; titleSize: number; bodySize: number; width: number };
	locales: Record<"en" | "vi", { copy: Partial<Record<TicketTemplateCopyKey, string>>; purchaseBody: string; giftBody: string }>;
};

export const ticketTemplateSettings = pgTable("ticket_template_settings", {
	id: integer("id").primaryKey().default(1),
	config: jsonb("config").$type<TicketTemplateConfig>().notNull(),
	revision: integer("revision").notNull().default(0),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [check("ticket_template_settings_singleton", sql`${t.id} = 1`), check("ticket_template_revision_nonnegative", sql`${t.revision} >= 0`)]);
