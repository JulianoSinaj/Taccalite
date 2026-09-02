import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db/client";
import { emailOutbox } from "@/lib/db/schema";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { env, smtpAuthConfigured, smtpConfigured } from "@/lib/env";

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

/**
 * Timeouts, in milliseconds.
 *
 * Nodemailer's defaults are effectively "wait for the OS socket timeout", which
 * is minutes. That is fatal here because mail is sent from inside request
 * handlers: an SMTP host that accepts the TCP connection and then goes quiet —
 * a firewall black-holing port 587, a relay under load, a host configured but
 * not yet credentialed — hangs the request rather than failing it. The admin
 * settings page reproduced exactly this and took over two minutes to not load.
 *
 * Ten seconds is far longer than a healthy relay needs and far shorter than a
 * user will wait. Exceeding it surfaces as a normal send failure: the message is
 * already in the outbox, so the cron drain retries it later.
 */
const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;
/**
 * Shorter budget for the interactive check, which blocks a page render rather
 * than a background send. Someone fixing their SMTP settings reloads this page
 * repeatedly, so a broken config should fail fast; a healthy relay answers in
 * well under a second, so nothing correct is ever cut off by this.
 */
const CHECK_TIMEOUT_MS = 5_000;

function getTransport(): Transporter | null {
  if (!smtpConfigured) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
  return transporter;
}

export type MailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * The recipient's unsubscribe URL, for bulk mail only.
   *
   * Gmail and Yahoo have required `List-Unsubscribe` and
   * `List-Unsubscribe-Post` from bulk senders since February 2024; without them
   * a newsletter's deliverability degrades and it starts arriving in spam,
   * which is a slow failure nobody attributes to a missing header. The link was
   * already in the body — this is the machine-readable half.
   *
   * Deliberately absent from transactional mail: nobody opts out of their own
   * order confirmation, and telling a mail client they can would be worse than
   * saying nothing.
   */
  listUnsubscribeUrl?: string | null;
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
      listUnsubscribeUrl: input.listUnsubscribeUrl ?? null,
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
      ...(input.listUnsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${input.listUnsubscribeUrl}>`,
              // Declares the link as one-click, which is what the providers
              // actually check for.
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : {}),
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

/** Sent messages older than this are pruned by the maintenance sweep. */
export const OUTBOX_RETENTION_DAYS = 90;

/**
 * What actually happened to the customer's copy of an order email.
 *
 *  - `sent`    — the relay accepted it.
 *  - `pending` — recorded but not delivered yet, and still inside the retry cap,
 *                so `drainOutbox` will try again (this is also the state when no
 *                SMTP is configured at all: the row sits `queued` forever).
 *  - `failed`  — out of attempts. Nothing further will happen on its own.
 *  - `none`    — nothing was ever recorded for this order.
 *
 * Exists because the checkout success page told every customer "ti abbiamo
 * inviato una email di conferma" unconditionally, while `placeOrder` throws the
 * `sendMail` results away in a `Promise.allSettled`. With a misconfigured relay
 * that sentence was simply false — and it is the one sentence the terms of sale
 * hang the contract on ("il contratto si conclude quando ricevi da noi l'email
 * di conferma"), so a customer who never got it had been told they had.
 *
 * Matched on the order number in the subject, which every customer-facing order
 * template carries (`Ordine confermato · ORD-…`, `Ordine ricevuto · ORD-…`).
 * Order numbers are generated from digits and hyphens, so they contain no LIKE
 * wildcard to escape.
 */
export async function orderEmailDelivery(
  orderNumber: string,
  toAddress: string,
): Promise<"sent" | "pending" | "failed" | "none"> {
  const [row] = await db
    .select({ status: emailOutbox.status, attempts: emailOutbox.attempts })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.toAddress, toAddress),
        sql`${emailOutbox.subject} like ${"%" + orderNumber + "%"}`,
      ),
    )
    .orderBy(sql`${emailOutbox.createdAt} desc`)
    .limit(1);

  if (!row) return "none";
  if (row.status === "sent") return "sent";
  return row.attempts >= OUTBOX_MAX_ATTEMPTS ? "failed" : "pending";
}

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
        listUnsubscribeUrl: emailOutbox.listUnsubscribeUrl,
      });
    if (!claimed) continue;

    attempted += 1;
    const res = await deliver(claimed.id, {
      to: claimed.toAddress,
      subject: claimed.subject,
      html: claimed.html,
      text: claimed.text,
      // Carried on the row, not recomputed: the drain re-sends long after the
      // broadcast that made it, and the URL holds a per-subscriber token.
      listUnsubscribeUrl: claimed.listUnsubscribeUrl,
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
 *
 * `authenticated` is reported separately from `ok` because `verify()` cannot
 * prove what its name suggests. Nodemailer only issues AUTH when the transport
 * carries credentials; with `auth: undefined` it connects, greets and resolves
 * — against a relay that will reject every real message with
 * `502 5.7.0 Please authenticate first`. Reporting that as success is how a
 * shop ends up with a green status page and no outgoing email at all, so an
 * unauthenticated connection is surfaced as its own state rather than folded
 * into `ok`.
 */
export async function checkMailer(): Promise<{
  ok: boolean;
  configured: boolean;
  /** True only when credentials were supplied AND the relay accepted them. */
  authenticated: boolean;
  error?: string;
}> {
  const transport = getTransport();
  if (!transport) return { ok: false, configured: false, authenticated: false };
  try {
    // Belt and braces over the transport's own timeouts: this runs during a page
    // render, and a settings page that hangs is worse than one reporting a
    // failed check. `verify()` keeps running in the background if it loses the
    // race; it holds no lock and its result is simply discarded.
    await Promise.race([
      transport.verify(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Timeout: il server di posta non ha risposto entro 5 secondi.")),
          CHECK_TIMEOUT_MS,
        ),
      ),
    ]);
    return { ok: true, configured: true, authenticated: smtpAuthConfigured };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      authenticated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
