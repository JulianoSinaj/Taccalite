import "server-only";
import { and, desc, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pageViews, orders } from "@/lib/db/schema";
import { dateInRome, instantInRome } from "@/lib/time";

const MAX_PATH = 512;

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

/**
 * Views bucketed by the UTC *hour* they happened in, as unix-ms.
 *
 * Not by day: SQLite has no timezone database, so `date(…, 'unixepoch')` can
 * only give a UTC day and `'localtime'` only the container's (also UTC). Either
 * way a visit at 00:30 in Ancona counted towards the day before, and the chart
 * disagreed with "Incasso oggi" beside it, which is resolved in Rome.
 *
 * Rome is always a whole number of hours ahead of UTC (+1, +2 in summer), so
 * every hour bucket falls entirely inside one Rome day and can be re-bucketed in
 * JS — correct across both DST changes, which a fixed offset would not be. At
 * most 90 x 24 rows come back.
 *
 * 3600000 is written out rather than interpolated from a constant, and that is
 * load-bearing: an interpolated JS number is bound as a REAL, which turns `/`
 * into float division, so every row lands in a bucket of its own and the GROUP BY
 * collapses nothing. The answer stays correct — the day is still derived from the
 * instant — so nothing fails; the query just returns one row per view instead of
 * one per hour. `test/analytics.test.ts` asserts the grouping actually groups.
 */
const hourExpr = sql<number>`(${pageViews.createdAt} / 3600000) * 3600000`;

/** Add `n` days to a yyyy-mm-dd string via UTC math (DST-safe). */
function isoAddDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

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
  // "Gli ultimi 30 giorni" means 30 whole Italian days ending with today, not a
  // rolling 30x24h from this instant. The two differ by however far into the day
  // it is now, which is why the headline count and the bars under it never quite
  // added up: the first bar was a part-day the total counted in full.
  const today = dateInRome(now);
  const firstDay = isoAddDays(today, -(range - 1));
  const sinceRange = instantInRome(firstDay, "00:00");
  const sincePrev = instantInRome(isoAddDays(today, -(2 * range - 1)), "00:00");

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

  const hourlyRows = await db
    .select({ hour: hourExpr, n: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.createdAt, sinceRange))
    .groupBy(hourExpr);

  // Roll the hours up onto the Rome day each one belongs to.
  const counts = new Map<string, number>();
  for (const row of hourlyRows) {
    const day = dateInRome(new Date(Number(row.hour)));
    counts.set(day, (counts.get(day) ?? 0) + row.n);
  }

  // Fill a contiguous `range`-day series (days with no views → 0) for a clean chart.
  const daily: { day: string; n: number }[] = [];
  for (let i = 0; i < range; i++) {
    const day = isoAddDays(firstDay, i);
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
