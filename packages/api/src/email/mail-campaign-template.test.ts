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
	member1_phone: "123",
	member1_facebook_profile_url: "https://facebook.com/captain",
	member1_university: "University 1",
	member2_name: "Member 2",
	member2_email: "member2@example.com",
	member2_phone: "456",
	member2_facebook_profile_url: "https://facebook.com/member2",
	member2_university: "University 2",
	member3_name: "Member 3",
	member3_email: "member3@example.com",
	member3_phone: null,
	member3_facebook_profile_url: null,
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

test("keeps ordered and unordered lists with supported inline content", () => {
	assert.equal(
		sanitizeMailCampaignBodyTemplate('<ul class="items"><li><strong>{{team_name}}</strong><ol><li><u>Nested</u></li></ol></li><li><a href="https://example.com" onclick="x()">Details</a><img src=x></li></ul><ol start="4"><li><em>First</em></li></ol>'),
		'<ul><li><strong>{{team_name}}</strong><ol><li><u>Nested</u></li></ol></li><li><a href="https://example.com">Details</a></li></ul><ol><li><em>First</em></li></ol>',
	);
});

test("rejects empty markup, unknown variables, and variables in link destinations", () => {
	assert.throws(() => validateMailCampaignBodyTemplate("<p><br></p>"), /BODY_REQUIRED/);
	assert.throws(() => validateMailCampaignBodyTemplate("<p>{{unknown}}</p>"), /UNKNOWN_PLACEHOLDER/);
	assert.throws(() => validateMailCampaignBodyTemplate('<p><a href="https://example.com/{{team_name}}">Team</a></p>'), /PLACEHOLDER_NOT_ALLOWED_IN_TAG:team_name/);
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

test("renders null database values with the missing-value label", () => {
	const rendered = renderMailCampaignTemplate({
		subjectTemplate: "Phone: {{member3_phone}}",
		bodyTemplate: "<p>Facebook: {{member3_facebook_profile_url}}</p>",
		values,
	});
	assert.equal(rendered.subject, "Phone: Chưa có");
	assert.match(rendered.html, /Facebook: Chưa có/);
});

test("reports every unknown placeholder by name", () => {
	assert.throws(
		() => validateMailCampaignBodyTemplate("<p>{{bad_phone}} {{bad_facebook}}</p>"),
		/UNKNOWN_PLACEHOLDER:bad_phone,bad_facebook/,
	);
});

test("creates a readable plain-text alternative with link destinations", () => {
	const template = '<p>First<br>Second</p><p><a href="https://example.com/path">Read more</a></p>';
	const text = mailCampaignBodyText(template);
	assert.match(text, /First\nSecond/);
	assert.match(text, /Read more \[https:\/\/example\.com\/path\]/);
});

test("creates readable bullets and numbering in the plain-text alternative", () => {
	const text = mailCampaignBodyText("<ul><li>Alpha</li><li>Beta</li></ul><ol><li>First</li><li>Second</li></ol>");
	assert.match(text, /\* Alpha/);
	assert.match(text, /\* Beta/);
	assert.match(text, /1\. First/);
	assert.match(text, /2\. Second/);
});

test("renders list markup with explicit email layout styling", () => {
	const rendered = renderMailCampaignTemplate({
		subjectTemplate: "List",
		bodyTemplate: "<ul><li>Alpha</li></ul><ol><li>First</li></ol>",
		values,
	});
	assert.match(rendered.html, /\.content ul, \.content ol \{ margin: 0 0 16px; padding-left: 26px; \}/);
	assert.match(rendered.html, /<ul><li>Alpha<\/li><\/ul><ol><li>First<\/li><\/ol>/);
});

test("repairs malformed pasted markup without retaining executable content", () => {
	const sanitized = sanitizeMailCampaignBodyTemplate('<p>Hello<strong> there<img src=x onerror="alert(1)"><iframe src="x">bad</iframe>');
	assert.equal(sanitized, "<p>Hello<strong> therebad</strong></p>");
});
