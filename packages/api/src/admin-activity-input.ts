import type { AdminActivityLogInput } from "@masc-landing/db/schema/admin-activity-logs";

const MAX_DEPTH = 4;
const MAX_ITEMS = 20;
const MAX_KEYS = 50;
const MAX_STRING_LENGTH = 200;
const MAX_SERIALIZED_LENGTH = 4096;
const REDACTED = "[REDACTED]";
const sensitiveKeyPattern = /(authorization|body|content|cookie|description|feedback|html|objectkey|password|secret|subject|text|token|url)/i;

function sanitizeValue(value: unknown, depth: number): AdminActivityLogInput {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[TRUNCATED]`
      : value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[MAX_DEPTH]";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => sanitizeValue(item, depth + 1));
    if (value.length > MAX_ITEMS) items.push(`[${value.length - MAX_ITEMS} MORE ITEMS]`);
    return items;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const sanitized: Record<string, AdminActivityLogInput> = {};
    for (const [key, nestedValue] of entries.slice(0, MAX_KEYS)) {
      sanitized[key] = sensitiveKeyPattern.test(key) ? REDACTED : sanitizeValue(nestedValue, depth + 1);
    }
    if (entries.length > MAX_KEYS) sanitized._truncatedKeys = entries.length - MAX_KEYS;
    return sanitized;
  }
  return String(value);
}

export function sanitizeAdminActivityInput(input: unknown): AdminActivityLogInput | null {
  if (input === undefined) return null;
  const sanitized = sanitizeValue(input, 0);
  const serialized = JSON.stringify(sanitized);
  if (serialized.length <= MAX_SERIALIZED_LENGTH) return sanitized;
  let preview = serialized.slice(0, MAX_SERIALIZED_LENGTH);
  let bounded: AdminActivityLogInput = { _truncated: true, preview: `${preview}…[TRUNCATED]` };
  while (JSON.stringify(bounded).length > MAX_SERIALIZED_LENGTH && preview.length > 0) {
    const overflow = JSON.stringify(bounded).length - MAX_SERIALIZED_LENGTH;
    preview = preview.slice(0, Math.max(0, preview.length - overflow));
    bounded = { _truncated: true, preview: `${preview}…[TRUNCATED]` };
  }
  return bounded;
}
