import QRCode from "qrcode";
import sharp from "sharp";
import type { Ticket } from "./core";
import { ticketTextPath, type TicketArtworkFont } from "./artwork-fonts";
import { ticketTemplateAppearance, ticketTemplatePalette, ticketTemplateCopy } from "./template-input";

export const escapeXml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function artworkText(text: string, y: number, size: number, color: string, font: TicketArtworkFont = "body", letterSpacing = 0) {
	return `<g aria-label="${escapeXml(text)}"><path d="${ticketTextPath(text, 450, y, size, font, letterSpacing)}" fill="${color}"/></g>`;
}

function textLines(text: string, limit = 48) {
	const words = text.split(/\s+/).flatMap(word => word.match(new RegExp(`.{1,${limit}}`, "gu")) ?? []);
	const lines = [""];
	for (const word of words) {
		if (lines.at(-1)!.length + word.length + 1 > limit) lines.push("");
		lines[lines.length - 1] += (lines.at(-1) ? " " : "") + word;
	}
	return lines;
}

export function renderTicketArtworkSvg(ticket: Ticket) {
	const copy = ticketTemplateCopy;
	const p = ticketTemplatePalette;
	const { brand, titleSize, bodySize } = ticketTemplateAppearance.artwork;
	let y = 145;
	const category = artworkText(copy[ticket.category], y, titleSize, ticket.category === "vip" ? p.vip : p.normal, "heading");
	y += titleSize + 12;
	const benefits = ticket.benefits.flatMap(() => textLines(copy.networkingLunch, Math.floor(1056 / bodySize)).map(line => {
		const tag = artworkText(line, y, bodySize, p.normal);
		y += bodySize + 9; return tag;
	})).join("");
	const qrTop = y + 49;
	const codeTop = qrTop + 600;
	const warningLines = textLines(copy.confidential, 60);
	const height = codeTop + 175 + warningLines.length * 28;
	const warning = warningLines.map((line, i) => artworkText(line, codeTop + 140 + i * 28, 20, p.muted)).join("");
	// Bundled fonts become paths so Sharp never needs server-installed fonts.
	// Text remains escaped in accessibility labels; QR geometry stays fixed.
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}">
		<rect width="900" height="${height}" fill="${p.background}"/>
		<rect x="24" y="24" width="852" height="${height - 48}" fill="${p.surface}" stroke="${p.border}"/>
		<path d="M60 74H160M740 74H840" stroke="${p.accent}" stroke-width="1"/>
		<g>
			${artworkText(brand, 81, 18, p.accent, "body", 4)}
			${category}${benefits}
			${artworkText(copy.admissionQr, qrTop - 52, 18, p.muted)}
			<rect x="162" y="${qrTop - 28}" width="576" height="576" fill="#ffffff"/>
			${artworkText(copy.code, codeTop, 18, p.accent)}
			${artworkText(ticket.code, codeTop + 44, 30, p.text, "code", 2)}
			${artworkText(`${copy.validity}: ${copy[ticket.validity]}`, codeTop + 86, 20, ticket.validity === "valid" ? p.valid : p.revoked)}
			<path d="M120 ${codeTop + 108}H780" stroke="${p.border}"/>
			${warning}
		</g>
	</svg>`;
	return { svg, qrTop };
}

export async function ticketPng(ticket: Ticket) {
	const { svg, qrTop } = renderTicketArtworkSvg(ticket);
	// Payload is exactly the code. Two-module quiet zone, solid white surrounding
	// space, and no branding, decorative marks or metadata inside the QR area.
	const qr = await QRCode.toBuffer(ticket.code, { type: "png", errorCorrectionLevel: "M", width: 576, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
	return sharp(Buffer.from(svg)).composite([{ input: qr, left: 162, top: qrTop - 28 }]).png().toBuffer();
}
