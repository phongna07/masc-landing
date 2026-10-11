import QRCode from "qrcode";
import sharp from "sharp";
import type { Ticket } from "./core";

export type ArtworkCopy = { admissionQr: string; normal: string; vip: string; networkingLunch: string; dateUnknown: string; venueUnknown: string; confidential: string; code: string; validity: string; valid: string; revoked: string };
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

export async function ticketPng(ticket: Ticket, locale: "en" | "vi", copy: ArtworkCopy) {
	const date = ticket.event.date ? new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: ticket.event.timezone }).format(new Date(ticket.event.date)) + ` (${ticket.event.timezone})` : copy.dateUnknown;
	let y = 145;
	const title = textLines(ticket.event.name, 36).map(line => {
		const tag = `<text x="450" y="${y}" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="#f4f0e8">${escapeXml(line)}</text>`;
		y += 44; return tag;
	}).join("");
	y += 12;
	const metadata = [date, ticket.event.venue || copy.venueUnknown];
	const details = metadata.flatMap(value => textLines(value).map(line => {
		const tag = `<text x="450" y="${y}" text-anchor="middle" font-size="22" fill="#c2bec6">${escapeXml(line)}</text>`;
		y += 31; return tag;
	})).join("");
	y += 20;
	const category = `<text x="450" y="${y}" text-anchor="middle" font-family="Georgia, serif" font-size="34" fill="${ticket.category === "vip" ? "#f2d584" : "#d8d0ff"}">${escapeXml(copy[ticket.category])}</text>`;
	y += 40;
	const benefits = ticket.benefits.flatMap(() => textLines(copy.networkingLunch).map(line => {
		const tag = `<text x="450" y="${y}" text-anchor="middle" font-size="22" fill="#d8d0ff">${escapeXml(line)}</text>`;
		y += 31; return tag;
	})).join("");
	const qrTop = y + 85;
	const codeTop = qrTop + 600;
	const warningLines = textLines(copy.confidential, 60);
	const height = codeTop + 175 + warningLines.length * 28;
	const warning = warningLines.map((line, i) => `<text x="450" y="${codeTop + 140 + i * 28}" text-anchor="middle" font-size="20" fill="#c2bec6">${escapeXml(line)}</text>`).join("");
	// Brand colors follow the dashboard. Typography uses its serif fallback;
	// no website font/assets or external image URLs are required for rendering.
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}">
		<rect width="900" height="${height}" fill="#07070a"/>
		<rect x="24" y="24" width="852" height="${height - 48}" fill="#111014" stroke="#38343d"/>
		<path d="M60 74H280M620 74H840" stroke="#d2a66c" stroke-width="1"/>
		<g font-family="Arial, sans-serif">
			<text x="450" y="81" text-anchor="middle" font-size="18" letter-spacing="4" fill="#d2a66c">MASC · HYPERNOVA</text>
			${title}${details}${category}${benefits}
			<text x="450" y="${qrTop - 52}" text-anchor="middle" font-size="18" fill="#c2bec6">${escapeXml(copy.admissionQr)}</text>
			<rect x="162" y="${qrTop - 28}" width="576" height="576" fill="#ffffff"/>
			<text x="450" y="${codeTop}" text-anchor="middle" font-size="18" fill="#d2a66c">${escapeXml(copy.code)}</text>
			<text x="450" y="${codeTop + 44}" text-anchor="middle" font-size="30" font-family="monospace" letter-spacing="2" fill="#f4f0e8">${escapeXml(ticket.code)}</text>
			<text x="450" y="${codeTop + 86}" text-anchor="middle" font-size="20" fill="${ticket.validity === "valid" ? "#bde7ad" : "#ff6b62"}">${escapeXml(copy.validity)}: ${escapeXml(copy[ticket.validity])}</text>
			<path d="M120 ${codeTop + 108}H780" stroke="#38343d"/>
			${warning}
		</g>
	</svg>`;
	// Payload is exactly the code. Four-module quiet zone, solid white surrounding
	// space, and no branding, decorative marks or metadata inside the QR area.
	const qr = await QRCode.toBuffer(ticket.code, { type: "png", errorCorrectionLevel: "M", width: 520, margin: 4, color: { dark: "#000000", light: "#ffffff" } });
	return sharp(Buffer.from(svg)).composite([{ input: qr, left: 190, top: qrTop }]).png().toBuffer();
}
