import { env } from "@masc-landing/env/server";

type EmailProvider = "zeptomail" | "maileroo";
type ProviderRole = "primary" | "fallback";
type FailureCategory = "http" | "network" | "protocol" | "timeout" | "validation";

type Mail = {
  id: string;
  from: string;
  to: string;
  cc: string[];
  subject: string;
  text: string;
  html: string;
};

type ProviderFailure = {
  provider: EmailProvider;
  role: ProviderRole;
  category: FailureCategory;
  message: string;
  transient: boolean;
  statusCode?: number;
};

const mailerooUrl = "https://smtp.maileroo.com/api/v2/emails";
const providerTimeoutMs = 30_000;
const maximumDiagnosticLength = 1_000;

class EmailProviderError extends Error {
  readonly provider: EmailProvider;
  readonly category: FailureCategory;
  readonly transient: boolean;
  readonly statusCode?: number;

  constructor(options: {
    provider: EmailProvider;
    category: FailureCategory;
    message: string;
    transient: boolean;
    statusCode?: number;
  }) {
    super(options.message);
    this.name = "EmailProviderError";
    this.provider = options.provider;
    this.category = options.category;
    this.transient = options.transient;
    this.statusCode = options.statusCode;
  }
}

class EmailDeliveryError extends Error {
  constructor(failures: ProviderFailure[]) {
    const attempts = failures.map((failure) => {
      const status = failure.statusCode ? ` HTTP ${failure.statusCode}` : "";
      return `${failure.provider} (${failure.role}, ${failure.category}${status}): ${failure.message}`;
    });
    super(`Email delivery failed: ${attempts.join("; ")}`);
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

function mailerooRecipient(address: string, displayName = "") {
  return displayName ? { address, display_name: displayName } : { address };
}

function isTransientHttpStatus(statusCode: number) {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
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
    env.MAILEROO_SENDING_KEY,
    env.ZEPTOMAIL_TOKEN,
    mail.from,
    mail.to,
    ...mail.cc,
    mail.subject,
    mail.text,
    mail.html,
  ].filter((value) => value.length > 0).sort((left, right) => right.length - left.length);

  let sanitized = message;
  for (const sensitiveValue of sensitiveValues) {
    sanitized = sanitized.replaceAll(sensitiveValue, "[REDACTED]");
  }
  return sanitized.slice(0, maximumDiagnosticLength);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  return "Unknown provider error";
}

async function postJson(provider: EmailProvider, url: string, headers: Record<string, string>, payload: unknown, mail: Mail) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, providerTimeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      const message = sanitizeDiagnostic(errorMessage(error), mail);
      if (timedOut || (error instanceof Error && error.name === "AbortError")) {
        throw new EmailProviderError({ provider, category: "timeout", message: "Request timed out after 30 seconds", transient: true });
      }
      throw new EmailProviderError({ provider, category: "network", message, transient: true });
    }

    let rawBody: string;
    try {
      rawBody = await response.text();
    } catch (error) {
      throw new EmailProviderError({
        provider,
        category: "network",
        message: sanitizeDiagnostic(errorMessage(error), mail),
        transient: true,
      });
    }

    let body: unknown;
    try {
      body = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {
      if (!response.ok) {
        throw new EmailProviderError({
          provider,
          category: "http",
          statusCode: response.status,
          message: response.statusText || "The provider returned a non-JSON error response",
          transient: isTransientHttpStatus(response.status),
        });
      }
      throw new EmailProviderError({
        provider,
        category: "protocol",
        message: "The provider returned an invalid JSON response",
        transient: false,
      });
    }

    if (!response.ok) {
      throw new EmailProviderError({
        provider,
        category: "http",
        statusCode: response.status,
        message: sanitizeDiagnostic(providerResponseMessage(body, response.statusText), mail),
        transient: isTransientHttpStatus(response.status),
      });
    }

    if (!isRecord(body)) {
      throw new EmailProviderError({
        provider,
        category: "protocol",
        message: "The provider returned an empty or unexpected response",
        transient: false,
      });
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWithZeptoMail(mail: Mail) {
  const sender = parseMailbox(mail.from);
  await postJson("zeptomail", env.ZEPTOMAIL_URL, { Authorization: env.ZEPTOMAIL_TOKEN }, {
    from: sender,
    to: [zeptoRecipient(mail.to)],
    cc: mail.cc.map(zeptoRecipient),
    subject: mail.subject,
    textbody: mail.text,
    htmlbody: mail.html,
  }, mail);
}

async function sendWithMaileroo(mail: Mail) {
  const sender = parseMailbox(mail.from);
  const response = await postJson("maileroo", mailerooUrl, {
    Authorization: `Bearer ${env.MAILEROO_SENDING_KEY}`,
  }, {
    from: mailerooRecipient(sender.address, sender.name),
    to: [mailerooRecipient(mail.to)],
    ...(mail.cc.length > 0 ? { cc: mail.cc.map((address) => mailerooRecipient(address)) } : {}),
    subject: mail.subject,
    html: mail.html,
    plain: mail.text,
  }, mail);

  if (response.success !== true) {
    throw new EmailProviderError({
      provider: "maileroo",
      category: "validation",
      message: sanitizeDiagnostic(providerResponseMessage(response, "Maileroo rejected the request"), mail),
      transient: false,
    });
  }
}

const providerSenders: Record<EmailProvider, (mail: Mail) => Promise<void>> = {
  zeptomail: sendWithZeptoMail,
  maileroo: sendWithMaileroo,
};

function normalizeFailure(error: unknown, provider: EmailProvider, role: ProviderRole, mail: Mail): ProviderFailure {
  if (error instanceof EmailProviderError) {
    return {
      provider,
      role,
      category: error.category,
      message: sanitizeDiagnostic(error.message, mail),
      transient: error.transient,
      ...(error.statusCode === undefined ? {} : { statusCode: error.statusCode }),
    };
  }

  return {
    provider,
    role,
    category: "validation",
    message: sanitizeDiagnostic(errorMessage(error), mail),
    transient: false,
  };
}

function failureForLog(failure: ProviderFailure) {
  return {
    provider: failure.provider,
    role: failure.role,
    category: failure.category,
    transient: failure.transient,
    ...(failure.statusCode === undefined ? {} : { statusCode: failure.statusCode }),
    message: failure.message,
  };
}

function logDeliveryFailure(mailId: string, failures: ProviderFailure[]) {
  console.error({
    event: "email_delivery_failed",
    mailId,
    attempts: failures.map(failureForLog),
  });
}

export async function sendMail(mail: Mail) {
  const primary: EmailProvider = env.PRIMARY_EMAIL_SERVICE ?? "zeptomail";
  const fallback: EmailProvider = primary === "zeptomail" ? "maileroo" : "zeptomail";
  const failures: ProviderFailure[] = [];

  try {
    await providerSenders[primary](mail);
    return;
  } catch (error) {
    const failure = normalizeFailure(error, primary, "primary", mail);
    failures.push(failure);
    if (!failure.transient) {
      logDeliveryFailure(mail.id, failures);
      throw new EmailDeliveryError(failures);
    }

    console.warn({
      event: "email_primary_provider_failed",
      mailId: mail.id,
      attempt: failureForLog(failure),
      fallbackProvider: fallback,
    });
  }

  try {
    await providerSenders[fallback](mail);
    console.info({
      event: "email_fallback_succeeded",
      mailId: mail.id,
      primaryFailure: failureForLog(failures[0]!),
      fallbackProvider: fallback,
    });
  } catch (error) {
    failures.push(normalizeFailure(error, fallback, "fallback", mail));
    logDeliveryFailure(mail.id, failures);
    throw new EmailDeliveryError(failures);
  }
}
