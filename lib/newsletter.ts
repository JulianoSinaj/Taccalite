import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsletterSubscribers } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail/mailer";
import { newsletterConfirmEmail } from "@/lib/mail/templates";
import { absoluteUrl } from "@/lib/site";

export type SubscribeResult = { ok: true; already?: boolean } | { ok: false; error: string };

/** Start a double opt-in subscription: upsert pending + send confirmation email. */
export async function subscribeNewsletter(email: string, source = "footer"): Promise<SubscribeResult> {
  const normalized = email.trim().toLowerCase();

  const existing = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.email, normalized))
    .limit(1);

  if (existing[0]?.status === "confirmed") {
    return { ok: true, already: true };
  }

  const token = randomBytes(24).toString("hex");

  if (existing[0]) {
    await db
      .update(newsletterSubscribers)
      .set({ token, status: "pending", source })
      .where(eq(newsletterSubscribers.email, normalized));
  } else {
    await db.insert(newsletterSubscribers).values({ email: normalized, token, status: "pending", source });
  }

  const confirmUrl = absoluteUrl(`/api/newsletter/confirm?token=${token}`);
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
