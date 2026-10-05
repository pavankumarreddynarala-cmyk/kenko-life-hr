import nodemailer from "nodemailer";
import { ConfigurationError } from "@/lib/runtime-config";

// Outgoing email (vendor invitations, HR letters). Works with any SMTP account, for example
// Google Workspace / Gmail (smtp.gmail.com, port 465, an app password) or Zoho / Outlook.
export const mailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

export const replyToAddress = () => process.env.MAIL_REPLY_TO?.trim() || "accounts@thekenkolife.com";
export const fromAddress = () => process.env.MAIL_FROM?.trim() || process.env.SMTP_USER || "accounts@thekenkolife.com";

function transport() {
  if (!mailConfigured()) {
    throw new ConfigurationError(
      "MAIL_NOT_CONFIGURED",
      "Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.",
      "Email sending is not set up yet. Ask the main administrator to add the SMTP settings in Vercel, or download the file and send it from your own mailbox.",
    );
  }
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
};

export async function sendMail(input: MailInput) {
  await transport().sendMail({
    from: `"The Kenko Life" <${fromAddress()}>`,
    replyTo: replyToAddress(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });
}
