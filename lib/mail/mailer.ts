import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db/client";
import { emailOutbox } from "@/lib/db/schema";
import { and, eq, lt, or, sql } from "drizzle-orm";
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

/** Record a message in the outbox (status `queued`) without attempting delivery. */
async function insertOutbox(input: MailInput): Promise<string> {
  const [row] = await db
    .insert(emailOutbox)
    .values({ toAddress: input.to, subject: input.subject, html: input.html, text: input.text, status: "queued" })
    .returning({ id: emailOutbox.id });
  return row.id;
}

/** Attempt delivery of one outbox row (by id) and update its status/attempts. */
async function deliver(id: string, input: MailInput): Promise<MailResult> {
  const transport = getTransport();
  if (!transport) {
    // Dev/outbox mode — no SMTP configured; the row stays queued for later drain.
    console.info(`[mail] queued (no SMTP) → ${input.to}: ${input.subject}  [outbox ${id}]`);
    return { id, delivered: false };
  }
  try {
    await transport.sendMail({
      from: env.smtp.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    await db
      .update(emailOutbox)
      .set({ status: "sent", sentAt: new Date(), error: null, attempts: sql`${emailOutbox.attempts} + 1` })
      .where(eq(emailOutbox.id, id));
    return { id, delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(emailOutbox)
      .set({ status: "failed", error: message, attempts: sql`${emailOutbox.attempts} + 1` })
      .where(eq(emailOutbox.id, id));
    console.error(`[mail] send failed → ${input.to}: ${message}`);
    return { id, delivered: false, error: message };
  }
}

/** Record a message and try to deliver it immediately (the common path). */
export async function sendMail(input: MailInput): Promise<MailResult> {
  const id = await insertOutbox(input);
  return deliver(id, input);
}

/**
 * Record a message for later delivery by the outbox drain, WITHOUT sending now.
 * Used by bulk sends (broadcasts) so the request returns fast and delivery is
 * throttled by `drainOutbox` instead of firing hundreds of parallel SMTP calls.
 */
export async function enqueueMail(input: MailInput): Promise<{ id: string }> {
  return { id: await insertOutbox(input) };
}

/**
 * Retry outbox messages, throttled and oldest-first: every `queued` row and every
 * `failed` row still below the attempt cap. Intended for the cron sweep (and a
 * small inline batch right after a broadcast). No-op when SMTP isn't configured.
 */
export async function drainOutbox({
  max = 100,
  maxAttempts = 5,
  throttleMs = 150,
}: { max?: number; maxAttempts?: number; throttleMs?: number } = {}): Promise<{
  attempted: number;
  sent: number;
  remaining: number;
}> {
  if (!smtpConfigured) return { attempted: 0, sent: 0, remaining: 0 };

  const rows = await db
    .select()
    .from(emailOutbox)
    .where(
      or(
        eq(emailOutbox.status, "queued"),
        and(eq(emailOutbox.status, "failed"), lt(emailOutbox.attempts, maxAttempts)),
      ),
    )
    .orderBy(emailOutbox.createdAt)
    .limit(max);

  let sent = 0;
  for (const r of rows) {
    const res = await deliver(r.id, { to: r.toAddress, subject: r.subject, html: r.html, text: r.text });
    if (res.delivered) sent += 1;
    if (throttleMs > 0) await new Promise((resolve) => setTimeout(resolve, throttleMs));
  }
  return { attempted: rows.length, sent, remaining: rows.length - sent };
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
