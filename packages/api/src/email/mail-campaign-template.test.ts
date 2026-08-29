import assert from "node:assert/strict";
import test from "node:test";

import type { MailCampaignTemplateValues } from "../mail-campaign-schema";
import {
	mailCampaignBodyText,
	renderMailCampaignTemplate,
	sanitizeMailCampaignBodyTemplate,
	validateMailCampaignBodyTemplate,
} from "./mail-campaign-template";

const values: MailCampaignTemplateValues = {
	team_name: "A&B <script>alert(1)</script>",
	round: "1",
	captain_name: "Captain",
	captain_email: "captain@example.com",
	captain_phone: "123",
	member1_name: "Captain",
	member1_email: "captain@example.com",
	member1_university: "University 1",
	member2_name: "Member 2",
	member2_email: "member2@example.com",
	member2_university: "University 2",
	member3_name: "Member 3",
	member3_email: "member3@example.com",
	member3_university: "University 3",
	assigned_track: "Track",
	preference1: "One",
	preference2: "Two",
	preference3: "Three",
};

test("keeps only supported rich-text markup and normalizes editor tags", () => {
	assert.equal(
		sanitizeMailCampaignBodyTemplate('<div class="x"><b>Bold</b> <i>Italic</i> <u style="color:red">Under</u><br><img src=x><script>alert(1)</script></div>'),
		"<p><strong>Bold</strong> <em>Italic</em> <u>Under</u><br /></p>",
	);
});

test("keeps safe web and email links and unwraps unsafe links", () => {
	assert.equal(
		sanitizeMailCampaignBodyTemplate('<p><a href="https://example.com" onclick="x()">Web</a> <a href="mailto:hello@example.com">Email</a> <a href="javascript:alert(1)">Bad</a> <a href="/relative">Relative</a> <a href="//example.com">Protocol-relative</a></p>'),
		'<p><a href="https://example.com">Web</a> <a href="mailto:hello@example.com">Email</a> Bad Relative Protocol-relative</p>',
	);
});

test("rejects empty markup, unknown variables, and variables in link destinations", () => {
	assert.throws(() => validateMailCampaignBodyTemplate("<p><br></p>"), /BODY_REQUIRED/);
	assert.throws(() => validateMailCampaignBodyTemplate("<p>{{unknown}}</p>"), /UNKNOWN_PLACEHOLDER/);
	assert.throws(() => validateMailCampaignBodyTemplate('<p><a href="https://example.com/{{team_name}}">Team</a></p>'), /PLACEHOLDER_NOT_ALLOWED_IN_TAG/);
	assert.throws(() => validateMailCampaignBodyTemplate('<p><a href="https://example.com/?q=>{{team_name}}">Team</a></p>'), /PLACEHOLDER_NOT_ALLOWED_IN_TAG/);
});

test("escapes replacement values while retaining surrounding formatting", () => {
	const rendered = renderMailCampaignTemplate({
		subjectTemplate: "Hello {{team_name}}",
		bodyTemplate: "<p>Hello <strong>{{team_name}}</strong></p>",
		values,
	});
	assert.match(rendered.html, /<strong>A&amp;B &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/strong>/);
	assert.doesNotMatch(rendered.html, /<strong>A&B <script>/);
	assert.match(rendered.text, /Hello A&B <script>alert\(1\)<\/script>/);
	assert.equal(rendered.subject, "Hello A&B <script>alert(1)</script>");
});

test("creates a readable plain-text alternative with link destinations", () => {
	const template = '<p>First<br>Second</p><p><a href="https://example.com/path">Read more</a></p>';
	const text = mailCampaignBodyText(template);
	assert.match(text, /First\nSecond/);
	assert.match(text, /Read more \[https:\/\/example\.com\/path\]/);
});

test("repairs malformed pasted markup without retaining executable content", () => {
	const sanitized = sanitizeMailCampaignBodyTemplate('<p>Hello<strong> there<img src=x onerror="alert(1)"><iframe src="x">bad</iframe>');
	assert.equal(sanitized, "<p>Hello<strong> therebad</strong></p>");
});
