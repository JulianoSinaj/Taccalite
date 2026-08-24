import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stockNotifications } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail/mailer";
import { backInStockEmail } from "@/lib/mail/templates";

/**
 * Register interest in a product's restock. Idempotent per (product, email): a
 * pending request is not duplicated. Returns false if the email is already queued.
 */
export async function requestStockNotification(productId: string, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const existing = await db
    .select({ id: stockNotifications.id })
    .from(stockNotifications)
    .where(
      and(
        eq(stockNotifications.productId, productId),
        eq(stockNotifications.email, normalized),
        isNull(stockNotifications.notifiedAt),
      ),
    )
    .limit(1);
  if (existing.length) return false;
  await db.insert(stockNotifications).values({ productId, email: normalized });
  return true;
}

/** Count of customers currently waiting for a product to come back. */
export async function pendingStockNotificationCount(productId: string): Promise<number> {
  return db.$count(
    stockNotifications,
    and(eq(stockNotifications.productId, productId), isNull(stockNotifications.notifiedAt)),
  );
}

/**
 * Who is waiting, oldest request first.
 *
 * The product page printed "N in attesa di riassortimento" and stopped there —
 * a number with no way to see who it stood for and no way to act on it. Worth
 * something on its own too: an operator about to discontinue a line can see
 * there are eleven people still asking for it.
 */
export async function listPendingStockNotifications(productId: string, limit = 50) {
  return db
    .select({
      id: stockNotifications.id,
      email: stockNotifications.email,
      createdAt: stockNotifications.createdAt,
    })
    .from(stockNotifications)
    .where(and(eq(stockNotifications.productId, productId), isNull(stockNotifications.notifiedAt)))
    .orderBy(stockNotifications.createdAt)
    .limit(limit);
}

/**
 * Notify everyone waiting on a product and mark their request done. Best-effort:
 * called after a restock from admin. Never throws into the caller.
 */
export async function notifyBackInStock(productId: string, productName: string, productSlug: string): Promise<void> {
  try {
    const pending = await db
      .select()
      .from(stockNotifications)
      .where(and(eq(stockNotifications.productId, productId), isNull(stockNotifications.notifiedAt)));
    if (pending.length === 0) return;

    const built = backInStockEmail(productName, productSlug);
    await Promise.allSettled(
      pending.map((p) => sendMail({ to: p.email, subject: built.subject, html: built.html, text: built.text })),
    );

    const now = new Date();
    await Promise.all(
      pending.map((p) =>
        db.update(stockNotifications).set({ notifiedAt: now }).where(eq(stockNotifications.id, p.id)),
      ),
    );
  } catch (err) {
    console.error("[stock-notify] failed for", productId, err);
  }
}
