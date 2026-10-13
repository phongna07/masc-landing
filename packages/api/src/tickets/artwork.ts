import QRCode from "qrcode";
import sharp from "sharp";
import type { Ticket } from "./core";
import { ticketTemplateAppearance, ticketTemplatePalette, ticketTemplateCopy } from "./template-input";

export const escapeXml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

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
	const { brand, titleSize, bodySize, headingFont } = ticketTemplateAppearance.artwork;
	let y = 145;
	const category = `<text x="450" y="${y}" text-anchor="middle" font-family="${headingFont}" font-size="${titleSize}" fill="${ticket.category === "vip" ? p.vip : p.normal}">${escapeXml(copy[ticket.category])}</text>`;
	y += titleSize + 12;
	const benefits = ticket.benefits.flatMap(() => textLines(copy.networkingLunch, Math.floor(1056 / bodySize)).map(line => {
		const tag = `<text x="450" y="${y}" text-anchor="middle" font-size="${bodySize}" fill="${p.normal}">${escapeXml(line)}</text>`;
		y += bodySize + 9; return tag;
	})).join("");
	const qrTop = y + 85;
	const codeTop = qrTop + 600;
	const warningLines = textLines(copy.confidential, 60);
	const height = codeTop + 175 + warningLines.length * 28;
	const warning = warningLines.map((line, i) => `<text x="450" y="${codeTop + 140 + i * 28}" text-anchor="middle" font-size="20" fill="${p.muted}">${escapeXml(line)}</text>`).join("");
	// Fixed appearance and escaped text enter the SVG.
	// No external images or fonts are loaded; QR geometry stays fixed.
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}">
		<rect width="900" height="${height}" fill="${p.background}"/>
		<rect x="24" y="24" width="852" height="${height - 48}" fill="${p.surface}" stroke="${p.border}"/>
		<path d="M60 74H280M620 74H840" stroke="${p.accent}" stroke-width="1"/>
		<g font-family="Arial, sans-serif">
			<text x="450" y="81" text-anchor="middle" font-size="18" letter-spacing="4" fill="${p.accent}">${escapeXml(brand)}</text>
			${category}${benefits}
			<text x="450" y="${qrTop - 52}" text-anchor="middle" font-size="18" fill="${p.muted}">${escapeXml(copy.admissionQr)}</text>
			<rect x="162" y="${qrTop - 28}" width="576" height="576" fill="#ffffff"/>
			<text x="450" y="${codeTop}" text-anchor="middle" font-size="18" fill="${p.accent}">${escapeXml(copy.code)}</text>
			<text x="450" y="${codeTop + 44}" text-anchor="middle" font-size="30" font-family="monospace" letter-spacing="2" fill="${p.text}">${escapeXml(ticket.code)}</text>
			<text x="450" y="${codeTop + 86}" text-anchor="middle" font-size="20" fill="${ticket.validity === "valid" ? p.valid : p.revoked}">${escapeXml(copy.validity)}: ${escapeXml(copy[ticket.validity])}</text>
			<path d="M120 ${codeTop + 108}H780" stroke="${p.border}"/>
			${warning}
		</g>
	</svg>`;
	return { svg, qrTop };
}

export async function ticketPng(ticket: Ticket) {
	const { svg, qrTop } = renderTicketArtworkSvg(ticket);
	// Payload is exactly the code. Four-module quiet zone, solid white surrounding
	// space, and no branding, decorative marks or metadata inside the QR area.
	const qr = await QRCode.toBuffer(ticket.code, { type: "png", errorCorrectionLevel: "M", width: 520, margin: 4, color: { dark: "#000000", light: "#ffffff" } });
	return sharp(Buffer.from(svg)).composite([{ input: qr, left: 190, top: qrTop }]).png().toBuffer();
}
