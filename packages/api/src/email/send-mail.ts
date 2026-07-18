import { env } from "@masc-landing/env/server";
import nodemailer from "nodemailer";

type Mail = {
  from: string;
  to: string;
  cc: string[];
  subject: string;
  text: string;
  html: string;
};

class ResendDailyQuotaError extends Error {
  constructor() {
    super("Resend daily email quota exceeded");
    this.name = "ResendDailyQuotaError";
  }
}

const tinoMailTransport = nodemailer.createTransport({
  host: env.MAIL_SERVER_URL,
  port: env.MAIL_SERVER_PORT,
  secure: false,
  requireTLS: true,
  auth: {
    user: env.MAIL_USERNAME,
    pass: env.MAIL_PASSWORD,
  },
});

function parseResendError(details: string) {
  try {
    const parsed: unknown = JSON.parse(details);
    if (typeof parsed === "object" && parsed !== null) {
      const error = parsed as Record<string, unknown>;
      return {
        name: typeof error.name === "string" ? error.name : undefined,
        message: typeof error.message === "string" ? error.message : details,
      };
    }
  } catch {
    // Preserve the raw response when Resend does not return its documented JSON shape.
  }
  return { name: undefined, message: details };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown SMTP error";
}

async function sendWithTinoMail(mail: Mail) {
  await tinoMailTransport.sendMail(mail);
}

async function sendWithResend(mail: Mail) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mail),
  });

  if (!response.ok) {
    const details = await response.text();
    const resendError = parseResendError(details);
    if (response.status === 429 && resendError.name === "daily_quota_exceeded") {
      throw new ResendDailyQuotaError();
    }
    const errorName = resendError.name ? `, ${resendError.name}` : "";
    throw new Error(`Resend request failed (${response.status}${errorName}): ${resendError.message}`);
  }
}

export async function sendMail(mail: Mail) {
  try {
    await sendWithResend(mail);
  } catch (error) {
    if (!(error instanceof ResendDailyQuotaError)) throw error;
    try {
      await sendWithTinoMail(mail);
    } catch (fallbackError) {
      throw new Error(
        `TinoMail fallback failed after Resend daily quota was exceeded: ${errorMessage(fallbackError)}`,
        { cause: fallbackError },
      );
    }
  }
}
