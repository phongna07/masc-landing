import { z } from "zod";
import type { TicketTemplateConfig } from "@masc-landing/db/schema/ticket-templates";

export const artworkCopyKeys = ["admissionQr", "normal", "vip", "networkingLunch", "confidential", "code", "validity", "valid", "revoked"] as const;
export const emailCopyKeys = ["subject", "giftSubject", "intro", "giftIntro", "attachments", "package", "quantity", "total", "order", "revokedNotice"] as const;
export const templateCopyKeys = [...artworkCopyKeys, ...emailCopyKeys] as const;
export const emailTemplateVariables = ["recipientName", "orderId", "packageName", "quantity", "total"] as const;
export type TicketEmailCopy = Record<typeof templateCopyKeys[number], string>;

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const paletteInput = z.object({
	background: color, surface: color, border: color, text: color, muted: color, accent: color,
	highlight: color, highlightBackground: color, normal: color, vip: color, valid: color, revoked: color,
});
const appearance = {
	brand: z.string().trim().min(1).max(40),
	palette: paletteInput,
	headingFont: z.enum(["serif", "sans"]),
};
// Keep single-line labels bounded, while allowing longer instructions to wrap.
export const templateCopyLimit = (key: typeof templateCopyKeys[number]) =>
	["intro", "giftIntro", "attachments", "confidential", "revokedNotice"].includes(key) ? 500 :
	["subject", "giftSubject", "networkingLunch"].includes(key) ? 120 : 40;
const copyInput = z.partialRecord(z.enum(templateCopyKeys), z.string().trim().min(1).max(500).refine(value => !/[\r\n]/.test(value)))
	.superRefine((copy, ctx) => {
		for (const key of templateCopyKeys) if ((copy[key]?.length ?? 0) > templateCopyLimit(key)) {
			ctx.addIssue({ code: "custom", path: [key], message: `Maximum ${templateCopyLimit(key)} characters` });
		}
	});
const localeInput = z.object({ copy: copyInput, purchaseBody: z.string().max(20_000), giftBody: z.string().max(20_000) });
export const ticketTemplateInput = z.object({
	artwork: z.object({ ...appearance, titleSize: z.number().int().min(28).max(48), bodySize: z.number().int().min(18).max(26) }),
	email: z.object({ ...appearance, titleSize: z.number().int().min(24).max(40), bodySize: z.number().int().min(12).max(18), width: z.number().int().min(480).max(800) }),
	locales: z.object({ en: localeInput, vi: localeInput }),
});
export const saveTicketTemplatesInput = z.object({ config: ticketTemplateInput, revision: z.number().int().nonnegative() });
export const previewTicketTemplatesInput = z.object({
	config: ticketTemplateInput,
	locale: z.enum(["en", "vi"]),
	category: z.enum(["normal", "vip"]),
	validity: z.enum(["valid", "revoked"]),
	source: z.enum(["purchased", "gifted"]),
	quantity: z.number().int().min(1).max(3),
});

const palette = {
	background: "#07070a", surface: "#111014", border: "#38343d", text: "#f4f0e8", muted: "#c2bec6",
	accent: "#d2a66c", highlight: "#f2d584", highlightBackground: "#201c16",
	normal: "#d8d0ff", vip: "#f2d584", valid: "#bde7ad", revoked: "#ff6b62",
};
export const defaultTicketTemplates: TicketTemplateConfig = {
	artwork: { brand: "MASC · HYPERNOVA", palette: { ...palette }, headingFont: "serif", titleSize: 36, bodySize: 22 },
	email: { brand: "MASC · HYPERNOVA", palette: { ...palette }, headingFont: "serif", titleSize: 30, bodySize: 14, width: 650 },
	locales: { en: { copy: {}, purchaseBody: "", giftBody: "" }, vi: { copy: {}, purchaseBody: "", giftBody: "" } },
};
export const templateHeadingFont = (font: "serif" | "sans") => font === "serif" ? "Georgia, serif" : "Arial, sans-serif";
export function ticketTemplateCopy<T extends Record<typeof artworkCopyKeys[number], string>>(base: T, config: TicketTemplateConfig, locale: "en" | "vi"): T {
	return { ...base, ...config.locales[locale].copy };
}
