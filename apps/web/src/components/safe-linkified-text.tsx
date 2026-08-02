import type { ReactNode } from "react";

const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;
const SENTENCE_PUNCTUATION = new Set([".", ",", "!", "?", ";", ":"]);
const CLOSING_PAIRS: Record<string, string> = {
	")": "(",
	"]": "[",
	"}": "{",
};

function countCharacter(value: string, character: string) {
	let count = 0;
	for (const current of value) {
		if (current === character) count += 1;
	}
	return count;
}

function withoutTrailingPunctuation(value: string) {
	let candidate = value;

	while (candidate.length > 0) {
		const lastCharacter = candidate.at(-1)!;
		if (SENTENCE_PUNCTUATION.has(lastCharacter)) {
			candidate = candidate.slice(0, -1);
			continue;
		}

		const openingCharacter = CLOSING_PAIRS[lastCharacter];
		if (
			openingCharacter
			&& countCharacter(candidate, lastCharacter) > countCharacter(candidate, openingCharacter)
		) {
			candidate = candidate.slice(0, -1);
			continue;
		}

		break;
	}

	return candidate;
}

function safeHttpUrl(value: string) {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
	} catch {
		return null;
	}
}

export function SafeLinkifiedText({ text }: { text: string }) {
	const content: ReactNode[] = [];
	let textStart = 0;

	for (const match of text.matchAll(HTTP_URL_PATTERN)) {
		const matchStart = match.index;
		const previousCharacter = text.at(matchStart - 1);
		if (previousCharacter && /[\w@:/]/u.test(previousCharacter)) continue;

		const matchedText = match[0];
		const linkText = withoutTrailingPunctuation(matchedText);
		const href = safeHttpUrl(linkText);

		if (!href) continue;
		if (matchStart > textStart) content.push(text.slice(textStart, matchStart));
		content.push(
			<a
				className="announcement-content-link"
				href={href}
				key={`${matchStart}-${linkText}`}
				rel="noopener noreferrer"
				target="_blank"
			>
				{linkText}
			</a>,
		);
		textStart = matchStart + linkText.length;
	}

	if (textStart < text.length) content.push(text.slice(textStart));
	return <>{content}</>;
}
