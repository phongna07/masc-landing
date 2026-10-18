import { env } from "@masc-landing/env/server";

type FailureCategory = "http" | "network" | "protocol" | "timeout" | "validation";

type Mail = {
  id: string;
  from: string;
  to: string;
  cc: string[];
  subject: string;
  text: string;
  html: string;
  attachments?: { name: string; content: string; mimeType: string }[];
  confidential?: boolean;
};

type DeliveryFailure = {
  category: FailureCategory;
  message: string;
  statusCode?: number;
};

const providerTimeoutMs = 30_000;
const maximumDiagnosticLength = 1_000;

class EmailProviderError extends Error {
  readonly category: FailureCategory;
  readonly statusCode?: number;

  constructor(options: {
    category: FailureCategory;
    message: string;
    statusCode?: number;
  }) {
    super(options.message);
    this.name = "EmailProviderError";
    this.category = options.category;
    this.statusCode = options.statusCode;
  }
}

class EmailDeliveryError extends Error {
  constructor(failure: DeliveryFailure) {
    const status = failure.statusCode ? ` HTTP ${failure.statusCode}` : "";
    super(`Email delivery failed: zeptomail (${failure.category}${status}): ${failure.message}`);
    this.name = "EmailDeliveryError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMailbox(mailbox: string) {
  const formattedMailbox = mailbox.match(/^\s*(.*?)\s*<\s*([^<>]+)\s*>\s*$/);
  if (!formattedMailbox) {
    return { address: mailbox.trim(), name: "" };
  }

  return {
    address: formattedMailbox[2]!.trim(),
    name: formattedMailbox[1]!.trim().replace(/^"(.*)"$/, "$1"),
  };
}

function zeptoRecipient(address: string) {
  return {
    email_address: {
      address,
      name: "",
    },
  };
}

function providerResponseMessage(body: unknown, statusText: string) {
  if (isRecord(body)) {
    if (typeof body.message === "string" && body.message.trim()) return body.message;
    if (typeof body.error === "string" && body.error.trim()) return body.error;
    if (isRecord(body.error)) {
      const code = typeof body.error.code === "string" || typeof body.error.code === "number"
        ? String(body.error.code)
        : undefined;
      const message = typeof body.error.message === "string" ? body.error.message : undefined;
      if (code && message) return `${code}: ${message}`;
      if (message) return message;
      if (code) return code;
    }
  }
  return statusText || "The provider returned an error without a message";
}

function sanitizeDiagnostic(message: string, mail: Mail) {
  const sensitiveValues = [
    env.ZEPTOMAIL_TOKEN,
    env.MAIL_REPLY_TO,
    mail.from,
    mail.to,
    ...mail.cc,
    mail.subject,
    mail.text,
    mail.html,
    ...(mail.attachments?.map(attachment => attachment.content) ?? []),
  ].filter((value) => value.length > 0).sort((left, right) => right.length - left.length);

  let sanitized = message;
  for (const sensitiveValue of sensitiveValues) {
    sanitized = sanitized.replaceAll(sensitiveValue, "[REDACTED]");
  }
  return sanitized.replace(/[A-HJ-NP-Z2-9]{20}/gi, "[REDACTED]").slice(0, maximumDiagnosticLength);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  return "Unknown provider error";
}

async function postJson(payload: unknown, mail: Mail) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, providerTimeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(env.ZEPTOMAIL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: env.ZEPTOMAIL_TOKEN },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      const message = sanitizeDiagnostic(errorMessage(error), mail);
      if (timedOut || (error instanceof Error && error.name === "AbortError")) {
        throw new EmailProviderError({ category: "timeout", message: "Request timed out after 30 seconds" });
      }
      throw new EmailProviderError({ category: "network", message });
    }

    let rawBody: string;
    try {
      rawBody = await response.text();
    } catch (error) {
      throw new EmailProviderError({
        category: "network",
        message: sanitizeDiagnostic(errorMessage(error), mail),
      });
    }

    let body: unknown;
    try {
      body = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {
      if (!response.ok) {
        throw new EmailProviderError({
          category: "http",
          statusCode: response.status,
          message: response.statusText || "The provider returned a non-JSON error response",
        });
      }
      throw new EmailProviderError({
        category: "protocol",
        message: "The provider returned an invalid JSON response",
      });
    }

    if (!response.ok) {
      throw new EmailProviderError({
        category: "http",
        statusCode: response.status,
        message: sanitizeDiagnostic(providerResponseMessage(body, response.statusText), mail),
      });
    }

    if (!isRecord(body)) {
      throw new EmailProviderError({
        category: "protocol",
        message: "The provider returned an empty or unexpected response",
      });
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWithZeptoMail(mail: Mail) {
  const sender = parseMailbox(mail.from);
  await postJson({
    from: sender,
    reply_to: [{ address: env.MAIL_REPLY_TO }],
    to: [zeptoRecipient(mail.to)],
    cc: mail.cc.map(zeptoRecipient),
    subject: mail.subject,
    textbody: mail.text,
    htmlbody: mail.html,
    ...(mail.attachments?.length ? { attachments: mail.attachments.map(attachment => ({ name: attachment.name, content: attachment.content, mime_type: attachment.mimeType })) } : {}),
    ...(mail.confidential ? { track_opens: false, track_clicks: false } : {}),
  }, mail);
}

function normalizeFailure(error: unknown, mail: Mail): DeliveryFailure {
  if (error instanceof EmailProviderError) {
    return {
      category: error.category,
      message: sanitizeDiagnostic(error.message, mail),
      ...(error.statusCode === undefined ? {} : { statusCode: error.statusCode }),
    };
  }

  return {
    category: "validation",
    message: sanitizeDiagnostic(errorMessage(error), mail),
  };
}

export async function sendMail(mail: Mail) {
  try {
    await sendWithZeptoMail(mail);
  } catch (error) {
    const failure = normalizeFailure(error, mail);
    console.error({
      event: "email_delivery_failed",
      mailId: mail.id,
      provider: "zeptomail",
      ...failure,
    });
    throw new EmailDeliveryError(failure);
  }
}
