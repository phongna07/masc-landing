import assert from "node:assert/strict";
import test from "node:test";

import {
	maximumRoundOneTrackDescriptionLength,
	sanitizeRoundOneTrackDescription,
} from "./round-one-track-description";

test("normalizes empty rich text to null", () => {
	assert.equal(sanitizeRoundOneTrackDescription("<p><br></p>"), null);
});

test("keeps only supported formatting", () => {
	assert.equal(
		sanitizeRoundOneTrackDescription('<div class="x"><b>Bold</b> <i>Italic</i> <u style="color:red">Under</u><img src=x><script>alert(1)</script></div>'),
		"<p><strong>Bold</strong> <em>Italic</em> <u>Under</u></p>",
	);
});

test("keeps safe links and forces new-tab protection", () => {
	assert.equal(
		sanitizeRoundOneTrackDescription('<p><a href="https://example.com" onclick="x()">Web</a> <a href="mailto:hello@example.com">Email</a></p>'),
		'<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">Web</a> <a href="mailto:hello@example.com" target="_blank" rel="noopener noreferrer">Email</a></p>',
	);
});

test("removes unsafe and relative link destinations", () => {
	assert.equal(
		sanitizeRoundOneTrackDescription('<p><a href="javascript:alert(1)">Bad</a> <a href="/relative">Relative</a></p>'),
		"<p>Bad Relative</p>",
	);
});

test("rejects descriptions exceeding the stored HTML limit", () => {
	assert.throws(
		() => sanitizeRoundOneTrackDescription(`<p>${"x".repeat(maximumRoundOneTrackDescriptionLength)}</p>`),
		/DESCRIPTION_TOO_LONG/,
	);
});
