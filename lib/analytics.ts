import "server-only";
import { and, desc, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pageViews, orders } from "@/lib/db/schema";

const MAX_PATH = 512;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Record a page view. First-party, cookieless, no IP, no PII: we keep only the
 * normalized pathname (no query/hash) and the referrer HOST (not the full URL).
 * GDPR-friendly — no consent needed.
 */
export async function recordPageView(rawPath: string, rawReferrer?: string | null): Promise<void> {
  let path = (rawPath || "/").split("?")[0].split("#")[0].trim();
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > MAX_PATH) path = path.slice(0, MAX_PATH);

  let referrer: string | null = null;
  if (rawReferrer) {
    try {
      referrer = new URL(rawReferrer).host || null;
    } catch {
      referrer = null;
    }
  }
  await db.insert(pageViews).values({ path, referrer });
}

const dayExpr = sql<string>`date(${pageViews.createdAt} / 1000, 'unixepoch')`;

/** Allowed analytics windows (days). Anything else is clamped to the nearest. */
export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Normalize an arbitrary value to one of the supported ranges (default 30). */
export function normalizeRange(value: unknown): AnalyticsRange {
  const n = Number(value);
  return (ANALYTICS_RANGES as readonly number[]).includes(n) ? (n as AnalyticsRange) : 30;
}

/**
 * Aggregate stats for the admin analytics dashboard.
 *
 * `rangeDays` (7 / 30 / 90) drives the top-paths, top-referrers and the daily
 * series; the last7/last30/total cards are always computed. Default 30 keeps
 * the historical behaviour for existing callers.
 */
export async function getAnalyticsSummary(now = new Date(), rangeDays = 30) {
  const range = normalizeRange(rangeDays);
  const sinceRange = new Date(now.getTime() - range * DAY_MS);
  const sincePrev = new Date(now.getTime() - 2 * range * DAY_MS);

  const [total] = await db.select({ n: sql<number>`count(*)` }).from(pageViews);
  // Headline figures follow the selected range. They were hard-coded to 7/30
  // and sat directly above the range chips, so picking "90 giorni" changed the
  // chart and the tables but not the numbers.
  const [inRange] = await db
    .select({ n: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.createdAt, sinceRange));
  const [prevRange] = await db
    .select({ n: sql<number>`count(*)` })
    .from(pageViews)
    .where(and(gte(pageViews.createdAt, sincePrev), lt(pageViews.createdAt, sinceRange)));

  // Commerce context over the same window. No per-visitor tracking is involved
  // — the beacon stays cookieless and identifier-free, so a true funnel isn't
  // available — but "how many visits, how many orders, how much money" is, and
  // it is the question the page was missing entirely.
  // Indexed as an expression by `orders_fiscal_date_idx` (drizzle/0033) — keep
  // this text identical to the index's or the planner silently reverts to a scan.
  const settledAt = sql`coalesce(${orders.paidAt}, ${orders.createdAt})`;
  const [commerce] = await db
    .select({
      orders: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(${orders.totalCents} - ${orders.refundedCents}), 0)`,
    })
    .from(orders)
    .where(
      and(
        inArray(orders.paymentStatus, ["paid", "refunded"]),
        sql`${settledAt} >= ${sinceRange.getTime()}`,
      ),
    );

  const topPaths = await db
    .select({ path: pageViews.path, n: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.createdAt, sinceRange))
    .groupBy(pageViews.path)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const topReferrers = await db
    .select({ referrer: pageViews.referrer, n: sql<number>`count(*)` })
    .from(pageViews)
    .where(and(gte(pageViews.createdAt, sinceRange), isNotNull(pageViews.referrer)))
    .groupBy(pageViews.referrer)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  const dailyRows = await db
    .select({ day: dayExpr, n: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.createdAt, sinceRange))
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  // Fill a contiguous `range`-day series (days with no views → 0) for a clean chart.
  const counts = new Map(dailyRows.map((d) => [d.day, d.n]));
  const daily: { day: string; n: number }[] = [];
  for (let i = range - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    daily.push({ day, n: counts.get(day) ?? 0 });
  }

  const views = inRange?.n ?? 0;
  const orderCount = commerce?.orders ?? 0;
  return {
    total: total?.n ?? 0,
    /** Views in the selected window, and in the window before it. */
    views,
    viewsPrev: prevRange?.n ?? 0,
    rangeDays: range,
    orders: orderCount,
    revenueCents: commerce?.revenue ?? 0,
    /** Orders per 1000 views — a rate, not a per-visitor conversion. */
    ordersPerThousandViews: views > 0 ? Math.round((orderCount / views) * 1000) : 0,
    topPaths,
    topReferrers,
    daily,
  };
}
