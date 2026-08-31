import sanitizeHtml from "sanitize-html";

export const maximumRoundOneTrackDescriptionLength = 20_000;

function safeLinkHref(value: string | undefined) {
	if (!value) return "";
	try {
		const url = new URL(value);
		return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : "";
	} catch {
		return "";
	}
}

function hasTextContent(value: string) {
	return value
		.replace(/<br\s*\/?>/gi, "")
		.replace(/<[^>]*>/g, "")
		.replace(/&nbsp;|&#160;/gi, "")
		.trim().length > 0;
}

export function sanitizeRoundOneTrackDescription(value: string) {
	const sanitized = sanitizeHtml(value, {
		allowedTags: ["p", "br", "strong", "em", "u", "a", "ul", "ol", "li"],
		allowedAttributes: { a: ["href", "target", "rel"] },
		allowedSchemes: ["http", "https", "mailto"],
		allowedSchemesAppliedToAttributes: ["href"],
		allowProtocolRelative: false,
		disallowedTagsMode: "discard",
		transformTags: {
			b: "strong",
			i: "em",
			div: "p",
			a: (tagName, attributes) => {
				const href = safeLinkHref(attributes.href);
				const attribs: Record<string, string> = href
					? { href, target: "_blank", rel: "noopener noreferrer" }
					: {};
				return {
					tagName,
					attribs,
				};
			},
		},
		exclusiveFilter: (frame) => frame.tag === "a" && !frame.attribs.href ? "excludeTag" : false,
	}).trim();
	if (!hasTextContent(sanitized)) return null;
	if (sanitized.length > maximumRoundOneTrackDescriptionLength) throw new Error("DESCRIPTION_TOO_LONG");
	return sanitized;
}
