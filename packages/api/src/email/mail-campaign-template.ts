import { htmlToText } from "html-to-text";
import sanitizeHtml from "sanitize-html";

import {
	mailCampaignPlaceholders,
	type MailCampaignPlaceholder,
	type MailCampaignTemplateValues,
} from "../mail-campaign-schema";
import { renderEmailLayout } from "./email-layout";

const placeholderSet = new Set<string>(mailCampaignPlaceholders);
const placeholderPattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
const maximumBodyTemplateLength = 20_000;

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

function assertPlaceholdersAreTextOnly(template: string) {
	for (const tag of template.matchAll(/<[^>]*>/g)) {
		if (tag[0].includes("{{") || tag[0].includes("}}")) {
			throw new Error("PLACEHOLDER_NOT_ALLOWED_IN_TAG");
		}
	}
}

function safeLinkHref(value: string | undefined) {
	if (!value) return "";
	try {
		const url = new URL(value);
		return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : "";
	} catch {
		return "";
	}
}

export function sanitizeMailCampaignBodyTemplate(template: string) {
	validateMailCampaignTemplate(template);
	assertPlaceholdersAreTextOnly(template);
	const sanitized = sanitizeHtml(template, {
		allowedTags: ["p", "br", "strong", "em", "u", "a"],
		allowedAttributes: { a: ["href"] },
		allowedSchemes: ["http", "https", "mailto"],
		allowedSchemesAppliedToAttributes: ["href"],
		allowProtocolRelative: false,
		disallowedTagsMode: "discard",
		transformTags: {
			b: "strong",
			i: "em",
			div: "p",
			a: (tagName, attribs) => ({
				tagName,
				attribs: { href: safeLinkHref(attribs.href) },
			}),
		},
		exclusiveFilter: (frame) => frame.tag === "a" && !frame.attribs.href ? "excludeTag" : false,
	});
	assertPlaceholdersAreTextOnly(sanitized);
	return sanitized;
}

function bodyHtmlToText(html: string) {
	return htmlToText(html, {
		wordwrap: false,
		selectors: [{ selector: "a", options: { hideLinkHrefIfSameAsText: true } }],
	}).trim();
}

export function mailCampaignBodyText(template: string) {
	return bodyHtmlToText(sanitizeMailCampaignBodyTemplate(template));
}

export function validateMailCampaignBodyTemplate(template: string) {
	const sanitized = sanitizeMailCampaignBodyTemplate(template);
	if (sanitized.length > maximumBodyTemplateLength) throw new Error("BODY_TOO_LONG");
	if (!bodyHtmlToText(sanitized)) throw new Error("BODY_REQUIRED");
	return sanitized;
}

function interpolatePlainText(template: string, values: MailCampaignTemplateValues) {
	validateMailCampaignTemplate(template);
	return template.replace(placeholderPattern, (_match, name: MailCampaignPlaceholder) => values[name]);
}

function interpolateHtml(template: string, values: MailCampaignTemplateValues) {
	const sanitized = validateMailCampaignBodyTemplate(template);
	return sanitized.replace(placeholderPattern, (_match, name: MailCampaignPlaceholder) => escapeHtml(values[name]));
}

export function renderMailCampaignTemplate(options: {
	subjectTemplate: string;
	bodyTemplate: string;
	values: MailCampaignTemplateValues;
}) {
	const subject = interpolatePlainText(options.subjectTemplate, options.values).replace(/[\r\n]+/g, " ");
	const contentHtml = interpolateHtml(options.bodyTemplate, options.values);
	const contentText = bodyHtmlToText(contentHtml);
	return {
		subject,
		...renderEmailLayout({ subject, contentHtml, contentText }),
	};
}
