import { db } from "@masc-landing/db";
import { ticketTemplateSettings, type TicketTemplateConfig } from "@masc-landing/db/schema/ticket-templates";
import { ticketTransaction } from "@masc-landing/db/ticket-transaction";
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { audit, ticketError } from "./core";
import { defaultTicketTemplates, ticketTemplateInput, previewTicketTemplatesInput, type TicketEmailCopy } from "./template-input";
import { normalizeTicketTemplates } from "./email-template";
import { previewTicketTemplates } from "./template-preview";

export async function getTicketTemplatePreview(input: z.infer<typeof previewTicketTemplatesInput>, messages: Record<"en" | "vi", TicketEmailCopy>) {
	return previewTicketTemplates(input, messages[input.locale]);
}

export async function getTicketTemplates() {
	const [row] = await db.select().from(ticketTemplateSettings).where(eq(ticketTemplateSettings.id, 1));
	return { config: row ? ticketTemplateInput.parse(row.config) : structuredClone(defaultTicketTemplates), revision: row?.revision ?? 0, updatedAt: row?.updatedAt ?? null };
}

export async function saveTicketTemplates(input: { config: TicketTemplateConfig; revision: number }, actorId: string) {
	const config = normalizeTicketTemplates(input.config);
	return ticketTransaction(async tx => {
		await tx.insert(ticketTemplateSettings).values({ id: 1, config: defaultTicketTemplates }).onConflictDoNothing();
		const [current] = await tx.select().from(ticketTemplateSettings).where(eq(ticketTemplateSettings.id, 1)).for("update");
		if (current!.revision !== input.revision) ticketError("templatesChanged", "CONFLICT");
		const [saved] = await tx.update(ticketTemplateSettings).set({ config, revision: current!.revision + 1, updatedAt: sql`now()` }).where(eq(ticketTemplateSettings.id, 1)).returning();
		await audit(tx, actorId, "templatesUpdated", "1");
		return { config: saved!.config, revision: saved!.revision, updatedAt: saved!.updatedAt };
	});
}
