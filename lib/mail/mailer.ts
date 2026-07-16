import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db/client";
import { emailOutbox } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { env, smtpConfigured } from "@/lib/env";

/**
 * Provider-agnostic mailer.
 *
 * Every message is recorded in the `email_outbox` table (audit + dev fallback).
 * If SMTP is configured (e.g. Gmail app password), the message is actually sent
 * and the row is marked `sent`; otherwise it stays `queued` and can be inspected
 * in the admin outbox — so no email is ever lost, and the app runs with zero
 * email setup. Swapping to a real provider later is an env-only change.
 */

let transporter: Transporter | null = null;

function getTransport(): Transporter | null {
  if (!smtpConfigured) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporter;
}

export type MailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type MailResult = { id: string; delivered: boolean; error?: string };

export async function sendMail({ to, subject, html, text }: MailInput): Promise<MailResult> {
  const [row] = await db
    .insert(emailOutbox)
    .values({ toAddress: to, subject, html, text, status: "queued" })
    .returning({ id: emailOutbox.id });

  const transport = getTransport();
  if (!transport) {
    // Dev/outbox mode — no SMTP configured.
    console.info(`[mail] queued (no SMTP) → ${to}: ${subject}  [outbox ${row.id}]`);
    return { id: row.id, delivered: false };
  }

  try {
    await transport.sendMail({ from: env.smtp.from, to, subject, html, text });
    await db
      .update(emailOutbox)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(emailOutbox.id, row.id));
    return { id: row.id, delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(emailOutbox).set({ status: "failed", error: message }).where(eq(emailOutbox.id, row.id));
    console.error(`[mail] send failed → ${to}: ${message}`);
    return { id: row.id, delivered: false, error: message };
  }
}

/** Verify SMTP connectivity (used by the admin settings/test button). */
export async function verifyMailer(): Promise<{ ok: boolean; configured: boolean; error?: string }> {
  const transport = getTransport();
  if (!transport) return { ok: false, configured: false };
  try {
    await transport.verify();
    return { ok: true, configured: true };
  } catch (err) {
    return { ok: false, configured: true, error: err instanceof Error ? err.message : String(err) };
  }
}
