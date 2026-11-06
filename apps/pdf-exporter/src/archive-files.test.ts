import assert from "node:assert/strict";
import { test } from "node:test";
import { uniqueEntryName } from "./archive-files";

test("ZIP entries preserve PDF/PPTX extensions, including duplicate team filenames", () => {
	const used = new Set<string>();
	assert.equal(uniqueEntryName("Team.pptx", used), "Team.pptx");
	assert.equal(uniqueEntryName("Team.pdf", used), "Team.pdf");
	assert.equal(uniqueEntryName("TEAM.PPTX", used), "TEAM (2).PPTX");
	assert.equal(uniqueEntryName("Team.pptx", used), "Team (3).pptx");
	assert.equal(uniqueEntryName(" Team/A.pptx ", used), "Team_A.pptx");
});
