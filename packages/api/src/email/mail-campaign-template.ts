import { renderEmailLayout } from "./email-layout";
import {
	mailCampaignPlaceholders,
	type MailCampaignPlaceholder,
	type MailCampaignTemplateValues,
} from "../mail-campaign-schema";

const placeholderSet = new Set<string>(mailCampaignPlaceholders);
const placeholderPattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
const urlPattern = /https?:\/\/[^\s<>]+/g;
const trailingUrlPunctuation = /[.,!?:;\)\]\}]+$/;

function escapeHtml(value: string) {
	return value.replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#039;",
	})[character] ?? character);
}

export function validateMailCampaignTemplate(template: string) {
	const unknown = new Set<string>();
	for (const match of template.matchAll(placeholderPattern)) {
		if (!placeholderSet.has(match[1]!)) unknown.add(match[1]!);
	}
	const withoutKnownShape = template.replace(placeholderPattern, "");
	if (withoutKnownShape.includes("{{") || withoutKnownShape.includes("}}")) {
		throw new Error("MALFORMED_PLACEHOLDER");
	}
	if (unknown.size) throw new Error(`UNKNOWN_PLACEHOLDER:${[...unknown].join(",")}`);
}

function interpolate(template: string, values: MailCampaignTemplateValues) {
	validateMailCampaignTemplate(template);
	return template.replace(placeholderPattern, (_match, name: MailCampaignPlaceholder) => values[name]);
}

function linkifyLine(value: string) {
	let result = "";
	let cursor = 0;
	for (const match of value.matchAll(urlPattern)) {
		const index = match.index ?? 0;
		const rawUrl = match[0];
		const trailing = rawUrl.match(trailingUrlPunctuation)?.[0] ?? "";
		const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
		result += escapeHtml(value.slice(cursor, index));
		result += `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>${escapeHtml(trailing)}`;
		cursor = index + rawUrl.length;
	}
	return result + escapeHtml(value.slice(cursor));
}

function plainTextToHtml(value: string) {
	return value
		.split(/\n{2,}/)
		.map((paragraph) => `<p>${paragraph.split("\n").map(linkifyLine).join("<br>")}</p>`)
		.join("\n");
}

export function renderMailCampaignTemplate(options: {
	subjectTemplate: string;
	bodyTemplate: string;
	values: MailCampaignTemplateValues;
}) {
	const subject = interpolate(options.subjectTemplate, options.values).replace(/[\r\n]+/g, " ");
	const contentText = interpolate(options.bodyTemplate, options.values);
	const contentHtml = plainTextToHtml(contentText);
	return {
		subject,
		...renderEmailLayout({ subject, contentHtml, contentText }),
	};
}
