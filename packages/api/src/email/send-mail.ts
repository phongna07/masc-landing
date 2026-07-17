import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { env } from "@masc-landing/env/server";

type Mail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

function encodeSesAddress(address: string) {
  const match = address.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (!match || /^[\x00-\x7F]*$/.test(match[1]!)) return address;
  return `=?UTF-8?B?${Buffer.from(match[1]!).toString("base64")}?= <${match[2]}>`;
}

async function sendWithAws(mail: Mail) {
  const ses = new SESClient({
    region: env.AWS_REGION!,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  await ses.send(new SendEmailCommand({
    Source: encodeSesAddress(mail.from),
    Destination: { ToAddresses: [mail.to] },
    Message: {
      Subject: { Data: mail.subject, Charset: "UTF-8" },
      Body: {
        Text: { Data: mail.text, Charset: "UTF-8" },
        Html: { Data: mail.html, Charset: "UTF-8" },
      },
    },
  }));
}

async function sendWithResend(mail: Mail) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mail),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend request failed (${response.status}): ${details}`);
  }
}

export async function sendMail(mail: Mail) {
  if (env.MAIL_SERVICE === "resend") return sendWithResend(mail);
  return sendWithAws(mail);
}
