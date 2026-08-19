import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db/client";
import { emailOutbox } from "@/lib/db/schema";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
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
async function insertOutbox(input: MailInput, campaignId?: string | null): Promise<string> {
  const [row] = await db
    .insert(emailOutbox)
    .values({
      toAddress: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      status: "queued",
      campaignId: campaignId ?? null,
    })
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
      .set({
        status: "sent",
        sentAt: new Date(),
        error: null,
        attempts: sql`${emailOutbox.attempts} + 1`,
        claimedAt: null,
      })
      .where(eq(emailOutbox.id, id));
    return { id, delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(emailOutbox)
      // Release the claim so a later drain can pick it up again (subject to the
      // attempt cap) rather than waiting out the stale-claim window.
      .set({
        status: "failed",
        error: message,
        attempts: sql`${emailOutbox.attempts} + 1`,
        claimedAt: null,
      })
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
export async function enqueueMail(
  input: MailInput,
  /** Tags the row so a campaign can report its own delivery outcomes. */
  opts: { campaignId?: string | null } = {},
): Promise<{ id: string }> {
  return { id: await insertOutbox(input, opts.campaignId) };
}

/** After this many failed attempts a message stops being retried automatically. */
export const OUTBOX_MAX_ATTEMPTS = 5;

/** A claim older than this is treated as abandoned (process died mid-send). */
const CLAIM_STALE_MS = 5 * 60 * 1000;

/**
 * Retry outbox messages, throttled and oldest-first: every `queued` row and every
 * `failed` row still below the attempt cap. Intended for the cron sweep (and a
 * small inline batch right after a broadcast). No-op when SMTP isn't configured.
 *
 * Each row is **claimed** before delivery is attempted. Previously the drain
 * selected candidates and then sent them one by one, so a cron sweep overlapping
 * a manual retry (which also drains) would both read the same rows and send the
 * same message twice. The claim is a conditional UPDATE, so only one caller can
 * win a given row; a claim left behind by a crashed process ages out.
 */
export async function drainOutbox({
  max = 100,
  maxAttempts = OUTBOX_MAX_ATTEMPTS,
  throttleMs = 150,
}: { max?: number; maxAttempts?: number; throttleMs?: number } = {}): Promise<{
  attempted: number;
  sent: number;
  remaining: number;
}> {
  if (!smtpConfigured) return { attempted: 0, sent: 0, remaining: 0 };

  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  const claimable = and(
    or(
      eq(emailOutbox.status, "queued"),
      and(eq(emailOutbox.status, "failed"), lt(emailOutbox.attempts, maxAttempts)),
    ),
    // Unclaimed, or claimed so long ago the claimant must be gone.
    or(isNull(emailOutbox.claimedAt), lt(emailOutbox.claimedAt, staleBefore)),
  );

  const candidates = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(claimable)
    .orderBy(emailOutbox.createdAt)
    .limit(max);

  let attempted = 0;
  let sent = 0;
  for (const c of candidates) {
    // Claim it. The same predicate is re-checked in the UPDATE, so if another
    // drain took this row between the SELECT and here, zero rows change and we
    // skip it rather than double-sending.
    const [claimed] = await db
      .update(emailOutbox)
      .set({ claimedAt: now })
      .where(and(eq(emailOutbox.id, c.id), claimable))
      .returning({
        id: emailOutbox.id,
        toAddress: emailOutbox.toAddress,
        subject: emailOutbox.subject,
        html: emailOutbox.html,
        text: emailOutbox.text,
      });
    if (!claimed) continue;

    attempted += 1;
    const res = await deliver(claimed.id, {
      to: claimed.toAddress,
      subject: claimed.subject,
      html: claimed.html,
      text: claimed.text,
    });
    if (res.delivered) sent += 1;
    if (throttleMs > 0) await new Promise((resolve) => setTimeout(resolve, throttleMs));
  }
  return { attempted, sent, remaining: attempted - sent };
}

/**
 * Verify SMTP connectivity: does the server answer and accept our credentials?
 *
 * Distinct from "send a test email and go look in the outbox", which cannot tell
 * a wrong password from a wrong recipient. Never throws — the settings page
 * renders whatever it learns.
 */
export async function checkMailer(): Promise<{ ok: boolean; configured: boolean; error?: string }> {
  const transport = getTransport();
  if (!transport) return { ok: false, configured: false };
  try {
    await transport.verify();
    return { ok: true, configured: true };
  } catch (err) {
    return { ok: false, configured: true, error: err instanceof Error ? err.message : String(err) };
  }
}

/** @deprecated Use {@link checkMailer}. Kept as the previous export name. */
export const verifyMailer = checkMailer;
