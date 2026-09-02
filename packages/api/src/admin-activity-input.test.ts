import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeAdminActivityInput } from "./admin-activity-input";

test("keeps useful admin operation identifiers and filters", () => {
  assert.deepEqual(sanitizeAdminActivityInput({
    teamId: "team-1",
    round: "1",
    status: "approved",
    archived: false,
  }), {
    teamId: "team-1",
    round: "1",
    status: "approved",
    archived: false,
  });
});

test("redacts content and secret-like fields recursively", () => {
  assert.deepEqual(sanitizeAdminActivityInput({
    campaignId: "campaign-1",
    bodyTemplate: "Private message",
    nested: { accessToken: "secret", previewUrl: "https://example.com/private" },
  }), {
    campaignId: "campaign-1",
    bodyTemplate: "[REDACTED]",
    nested: { accessToken: "[REDACTED]", previewUrl: "[REDACTED]" },
  });
});

test("bounds strings, arrays, object depth, and total serialized size", () => {
  const sanitized = sanitizeAdminActivityInput({
    label: "x".repeat(300),
    ids: Array.from({ length: 30 }, (_, index) => `id-${index}`),
    nested: { one: { two: { three: { four: "hidden" } } } },
    large: Array.from({ length: 20 }, (_, index) => ({ [`field${index}`]: "y".repeat(200) })),
  });
  const serialized = JSON.stringify(sanitized);

  assert.match(serialized, /\[TRUNCATED\]/);
  assert.match(serialized, /10 MORE ITEMS/);
  assert.ok(serialized.length <= 4096);
});
