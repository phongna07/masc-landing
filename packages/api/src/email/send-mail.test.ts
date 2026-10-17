import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

const env = {
  ZEPTOMAIL_URL: "https://api.zeptomail.com/v1.1/email",
  ZEPTOMAIL_TOKEN: "test-zepto-token",
  MAIL_REPLY_TO: "replies@example.com",
};
mock.module("@masc-landing/env/server", { namedExports: { env } });
const { sendMail } = await import("./send-mail");

const mail = {
  id: "mail-1",
  from: '"MASC Team" <sender@example.com>',
  to: "recipient@example.com",
  cc: ["copy@example.com"],
  subject: "Your tickets",
  text: "Private ticket details",
  html: "<p>Private ticket details</p>",
  attachments: [{ name: "ticket.png", content: "cHJpdmF0ZS10aWNrZXQ=", mimeType: "image/png" }],
  confidential: true,
};

beforeEach(() => {
  mock.method(console, "error", () => {});
});
afterEach(() => mock.restoreAll());

test("sends confidential email and attachments through ZeptoMail without provider-selection settings", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ data: [] }));

  await sendMail(mail);

  assert.equal(fetchMock.mock.callCount(), 1);
  const [url, options] = fetchMock.mock.calls[0]!.arguments;
  assert.equal(url, env.ZEPTOMAIL_URL);
  assert.equal(options?.method, "POST");
  assert.deepEqual(options?.headers, {
    "Content-Type": "application/json",
    Authorization: env.ZEPTOMAIL_TOKEN,
  });
  assert.deepEqual(JSON.parse(options?.body as string), {
    from: { address: "sender@example.com", name: "MASC Team" },
    reply_to: [{ address: env.MAIL_REPLY_TO }],
    to: [{ email_address: { address: mail.to, name: "" } }],
    cc: [{ email_address: { address: mail.cc[0], name: "" } }],
    subject: mail.subject,
    textbody: mail.text,
    htmlbody: mail.html,
    attachments: [{ name: "ticket.png", content: mail.attachments[0]!.content, mime_type: "image/png" }],
    track_opens: false,
    track_clicks: false,
  });
});

test("supports plain sender addresses and email without attachments or confidential tracking settings", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ data: [] }));
  await sendMail({ ...mail, from: "sender@example.com", cc: [], attachments: [], confidential: false });
  const payload = JSON.parse(fetchMock.mock.calls[0]!.arguments[1]?.body as string);
  assert.deepEqual(payload.from, { address: "sender@example.com", name: "" });
  assert.deepEqual(payload.cc, []);
  assert.equal("attachments" in payload, false);
  assert.equal("track_opens" in payload, false);
  assert.equal("track_clicks" in payload, false);
});

test("HTTP failures are reported after one request, including rate limits and server errors", async () => {
  for (const status of [400, 401, 429, 503]) {
    const fetchMock = mock.method(globalThis, "fetch", async () => Response.json({ error: { code: "REJECTED", message: "Request rejected" } }, { status }));
    await assert.rejects(sendMail(mail), {
      name: "EmailDeliveryError",
      message: `Email delivery failed: zeptomail (http HTTP ${status}): REJECTED: Request rejected`,
    });
    assert.equal(fetchMock.mock.callCount(), 1);
    fetchMock.mock.restore();
  }
});

test("network failures are reported once and redact credentials, message contents and attachments", async () => {
  const sensitiveValues = [env.ZEPTOMAIL_TOKEN, env.MAIL_REPLY_TO, mail.from, mail.to, ...mail.cc, mail.subject, mail.text, mail.html, mail.attachments[0]!.content];
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    throw new Error(`Network failure: ${sensitiveValues.join(" | ")}`);
  });
  const errorLog = mock.method(console, "error", () => {});

  await assert.rejects(sendMail(mail), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, "EmailDeliveryError");
    assert.match(error.message, /zeptomail \(network\)/);
    for (const value of sensitiveValues) assert.equal(error.message.includes(value), false);
    return true;
  });
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(errorLog.mock.callCount(), 1);
  const diagnostic = JSON.stringify(errorLog.mock.calls[0]!.arguments);
  for (const value of sensitiveValues) assert.equal(diagnostic.includes(value), false);
});

test("invalid and empty success responses are rejected without a second delivery attempt", async () => {
  for (const body of ["not json", "", "[]"]) {
    const fetchMock = mock.method(globalThis, "fetch", async () => new Response(body));
    await assert.rejects(sendMail(mail), { name: "EmailDeliveryError", message: /zeptomail \(protocol\)/ });
    assert.equal(fetchMock.mock.callCount(), 1);
    fetchMock.mock.restore();
  }
});

test("aborts requests after 30 seconds without another delivery attempt", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const fetchMock = mock.method(globalThis, "fetch", async (_url: Parameters<typeof fetch>[0], options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
  const rejected = assert.rejects(sendMail(mail), {
    name: "EmailDeliveryError",
    message: "Email delivery failed: zeptomail (timeout): Request timed out after 30 seconds",
  });
  context.mock.timers.tick(30_000);
  await rejected;
  assert.equal(fetchMock.mock.callCount(), 1);
});
