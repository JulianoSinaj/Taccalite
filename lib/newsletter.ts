import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsletterSubscribers } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail/mailer";
import { newsletterConfirmEmail } from "@/lib/mail/templates";
import { absoluteUrl } from "@/lib/site";

export type SubscribeResult = { ok: true; already?: boolean } | { ok: false; error: string };

/** Start a double opt-in subscription: upsert pending + send confirmation email. */
export async function subscribeNewsletter(email: string, source = "footer"): Promise<SubscribeResult> {
  const normalized = email.trim().toLowerCase();
  const token = randomBytes(24).toString("hex");

  // Race-safe upsert (the `email` column is UNIQUE): insert if new, otherwise
  // leave the row untouched — no select-then-insert TOCTOU where two concurrent
  // first-time subscribes could both try to INSERT and one 500s.
  await db
    .insert(newsletterSubscribers)
    .values({ email: normalized, token, status: "pending", source })
    .onConflictDoNothing({ target: newsletterSubscribers.email });

  // Refresh the token + reset to pending for anyone not already confirmed. A
  // confirmed subscriber is never downgraded (guarded by the status filter).
  await db
    .update(newsletterSubscribers)
    .set({ token, status: "pending", source })
    .where(
      and(eq(newsletterSubscribers.email, normalized), ne(newsletterSubscribers.status, "confirmed")),
    );

  const [row] = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, normalized))
    .limit(1);

  if (row?.status === "confirmed") {
    return { ok: true, already: true };
  }

  // Send using the token actually persisted, so the confirm link always matches.
  const confirmUrl = absoluteUrl(`/api/newsletter/confirm?token=${row?.token ?? token}`);
  await sendMail({ to: normalized, ...newsletterConfirmEmail(confirmUrl) }).catch(() => {});

  return { ok: true };
}

/** Complete a double opt-in from the emailed link. */
export async function confirmNewsletter(token: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.token, token))
    .limit(1);
  if (!rows[0]) return false;

  await db
    .update(newsletterSubscribers)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(eq(newsletterSubscribers.token, token));
  return true;
}
