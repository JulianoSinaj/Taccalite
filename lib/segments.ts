import "server-only";
import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  customerSegments,
  loyaltyAccounts,
  newsletterSubscribers,
  orders,
  users,
  type SegmentRule,
  type CustomerSegmentRow,
} from "@/lib/db/schema";

/**
 * Reusable customer segments.
 *
 * "Segments" used to mean the raw newsletter signup `source` — the only thing a
 * campaign could target. That can't express "clienti che hanno speso più di
 * 100 €" or "chi non ordina da sei mesi", which is most of what a shop actually
 * wants to say something to.
 *
 * A segment stores its **rule**, not a frozen list of addresses, so "clienti
 * fedeli" means the same thing in March as it did in January. Evaluation always
 * runs against confirmed newsletter subscribers: a segment is an audience for
 * mail, and someone who never opted in is not in it, however much they spend.
 */

export const listSegments = () =>
  db.select().from(customerSegments).orderBy(desc(customerSegments.createdAt));

export async function getSegment(id: string): Promise<CustomerSegmentRow | null> {
  const [row] = await db.select().from(customerSegments).where(eq(customerSegments.id, id)).limit(1);
  return row ?? null;
}

export type SegmentMember = { email: string; token: string };

/**
 * The subscribers a segment currently resolves to.
 *
 * Built as: confirmed subscribers → optionally narrowed by signup source →
 * optionally intersected with the set of account emails matching the
 * order/points criteria. An email with no account can only satisfy the
 * source rule, which is correct: nothing else is known about them.
 */
export async function resolveSegment(rule: SegmentRule): Promise<SegmentMember[]> {
  const conds: SQL[] = [eq(newsletterSubscribers.status, "confirmed")];
  if (rule.source) conds.push(eq(newsletterSubscribers.source, rule.source));

  const subs = await db
    .select({ email: newsletterSubscribers.email, token: newsletterSubscribers.token })
    .from(newsletterSubscribers)
    .where(and(...conds));

  const needsAccount =
    rule.minPoints != null ||
    rule.minOrders != null ||
    rule.minSpendCents != null ||
    rule.inactiveDays != null ||
    !!rule.shopSlug ||
    !!rule.requireMarketingConsent;
  if (!needsAccount) return subs;

  const eligible = await accountEmailsMatching(rule);
  return subs.filter((s) => eligible.has(s.email.toLowerCase()));
}

/** Emails of accounts satisfying the account-shaped parts of a rule. */
async function accountEmailsMatching(rule: SegmentRule): Promise<Set<string>> {
  const conds: SQL[] = [eq(users.active, true)];
  if (rule.requireMarketingConsent) conds.push(eq(users.marketingConsent, true));
  if (rule.minPoints != null) conds.push(gte(loyaltyAccounts.points, rule.minPoints));

  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .leftJoin(loyaltyAccounts, eq(loyaltyAccounts.userId, users.id))
    .where(and(...conds));

  const withEmail = rows.filter((r): r is { id: string; email: string } => !!r.email);
  const needsOrders =
    rule.minOrders != null || rule.minSpendCents != null || rule.inactiveDays != null || !!rule.shopSlug;
  if (!needsOrders) return new Set(withEmail.map((r) => r.email.toLowerCase()));

  // One grouped pass over settled orders, rather than a query per customer.
  // Indexed as an expression by `orders_fiscal_date_idx` (drizzle/0033) — keep
  // this text identical to the index's or the planner silently reverts to a scan.
  const settledAt = sql`coalesce(${orders.paidAt}, ${orders.createdAt})`;
  const orderConds: SQL[] = [inArray(orders.paymentStatus, ["paid", "refunded"])];
  if (rule.shopSlug) orderConds.push(eq(orders.shopSlug, rule.shopSlug));

  const stats = await db
    .select({
      userId: orders.userId,
      n: sql<number>`count(*)`,
      spent: sql<number>`coalesce(sum(${orders.totalCents} - ${orders.refundedCents}), 0)`,
      last: sql<number>`max(${settledAt})`,
    })
    .from(orders)
    .where(and(...orderConds))
    .groupBy(orders.userId);

  const byUser = new Map(stats.filter((s) => s.userId).map((s) => [s.userId!, s]));
  const cutoff =
    rule.inactiveDays != null ? Date.now() - rule.inactiveDays * 24 * 60 * 60 * 1000 : null;

  const out = new Set<string>();
  for (const r of withEmail) {
    const s = byUser.get(r.id);
    const n = s?.n ?? 0;
    const spent = s?.spent ?? 0;
    const last = s?.last ?? 0;

    if (rule.minOrders != null && n < rule.minOrders) continue;
    if (rule.minSpendCents != null && spent < rule.minSpendCents) continue;
    // "Hasn't ordered in N days" includes someone who has never ordered only if
    // no other criterion required a purchase.
    if (cutoff != null && last >= cutoff) continue;
    if (rule.shopSlug && n === 0) continue;
    out.add(r.email.toLowerCase());
  }
  return out;
}

/** How many subscribers a segment currently covers — shown next to its name. */
export async function countSegment(rule: SegmentRule): Promise<number> {
  return (await resolveSegment(rule)).length;
}

/** A one-line description of a rule, for the segment list. */
export function describeRule(rule: SegmentRule): string {
  const parts: string[] = [];
  if (rule.source) parts.push(`iscritti da «${rule.source}»`);
  if (rule.minPoints != null) parts.push(`almeno ${rule.minPoints} punti`);
  if (rule.minOrders != null) parts.push(`almeno ${rule.minOrders} ordini`);
  if (rule.minSpendCents != null) parts.push(`spesa ≥ ${(rule.minSpendCents / 100).toFixed(2)} €`);
  if (rule.shopSlug) parts.push(`clienti della sede ${rule.shopSlug}`);
  if (rule.inactiveDays != null) parts.push(`inattivi da ${rule.inactiveDays} giorni`);
  if (rule.requireMarketingConsent) parts.push("con consenso marketing");
  return parts.length > 0 ? parts.join(" · ") : "tutti gli iscritti confermati";
}
