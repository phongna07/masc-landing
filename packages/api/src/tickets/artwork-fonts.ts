import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as opentype from "opentype.js";
import type { Font } from "opentype.js";

export type TicketArtworkFont = "body" | "heading" | "code";
const fontFiles = { body: "NotoSans-Regular.ttf", heading: "NotoSerif-Regular.ttf", code: "NotoSansMono-Regular.ttf" } as const;
const fonts = new Map<TicketArtworkFont, Font>();
// Node loads the CommonJS entry; Next.js can use the named ESM exports.
const fontParser: Pick<typeof opentype, "parse"> = typeof opentype.parse === "function" ? opentype : Reflect.get(opentype, "default");

function getFont(family: TicketArtworkFont) {
	const cached = fonts.get(family);
	if (cached) return cached;
	// The web/API packages run two levels below the workspace root. Vercel can
	// also run the relocated function from the root of its traced workspace.
	const candidates = [
		path.resolve(process.cwd(), "../../packages/api/src/tickets/fonts", fontFiles[family]),
		path.resolve(process.cwd(), "packages/api/src/tickets/fonts", fontFiles[family]),
	];
	const filename = candidates.find(candidate => existsSync(candidate));
	if (!filename) throw new Error("Bundled ticket artwork font is missing");
	const bytes = readFileSync(filename);
	const font = fontParser.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
	fonts.set(family, font);
	return font;
}

export function ticketTextPath(text: string, x: number, y: number, size: number, family: TicketArtworkFont = "body", letterSpacing = 0) {
	const font = getFont(family);
	const normalized = text.normalize("NFC");
	if (Array.from(normalized).some(character => font.charToGlyphIndex(character) === 0)) {
		// Never include admission credentials in rendering errors.
		throw new Error("Bundled ticket artwork font does not support a character");
	}
	// Vietnamese is normalized to precomposed glyphs. Lay them out directly;
	// optional font substitution tables are unnecessary for these Latin labels.
	const glyphs = Array.from(normalized, character => font.charToGlyph(character));
	const scale = size / font.unitsPerEm;
	const advances = glyphs.map((glyph, index) => (glyph.advanceWidth ?? 0) * scale +
		(index + 1 < glyphs.length ? font.getKerningValue(glyph, glyphs[index + 1]!) * scale + letterSpacing : 0));
	let left = x - advances.reduce((sum, advance) => sum + advance, 0) / 2;
	const coordinate = (value: number) => Number(value.toFixed(2));
	return glyphs.map((glyph, index) => {
		// Serialize finite coordinates directly: opentype's decimal rounding
		// can produce NaN for values extremely close to an integer.
		const outline = glyph.getPath(left, y, size).commands.map(command => {
			switch (command.type) {
				case "M": case "L": return `${command.type}${coordinate(command.x)} ${coordinate(command.y)}`;
				case "Q": return `Q${coordinate(command.x1)} ${coordinate(command.y1)} ${coordinate(command.x)} ${coordinate(command.y)}`;
				case "C": return `C${coordinate(command.x1)} ${coordinate(command.y1)} ${coordinate(command.x2)} ${coordinate(command.y2)} ${coordinate(command.x)} ${coordinate(command.y)}`;
				case "Z": return "Z";
			}
		}).join("");
		left += advances[index]!;
		return outline;
	}).join("");
}
