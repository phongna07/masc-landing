import { env } from "@masc-landing/env/server";
import { SendMailClient } from "zeptomail";

type Mail = {
  from: string;
  to: string;
  cc: string[];
  subject: string;
  text: string;
  html: string;
};

const zeptoMailClient = new SendMailClient({
  url: env.ZEPTOMAIL_URL,
  token: env.ZEPTOMAIL_TOKEN,
});

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

function recipient(address: string) {
  return {
    email_address: {
      address,
      name: "",
    },
  };
}

export async function sendMail(mail: Mail) {
  await zeptoMailClient.sendMail({
    from: parseMailbox(mail.from),
    to: [recipient(mail.to)],
    cc: mail.cc.map(recipient),
    subject: mail.subject,
    textbody: mail.text,
    htmlbody: mail.html,
  });
}
