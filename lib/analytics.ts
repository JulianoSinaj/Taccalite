import "server-only";
import { and, desc, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pageViews } from "@/lib/db/schema";

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

/** Aggregate stats for the admin analytics dashboard. */
export async function getAnalyticsSummary(now = new Date()) {
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since14 = new Date(now.getTime() - 14 * DAY_MS);

  const [total] = await db.select({ n: sql<number>`count(*)` }).from(pageViews);
  const [last7] = await db
    .select({ n: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.createdAt, since7));
  const [last30] = await db
    .select({ n: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.createdAt, since30));

  const topPaths = await db
    .select({ path: pageViews.path, n: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.createdAt, since30))
    .groupBy(pageViews.path)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const topReferrers = await db
    .select({ referrer: pageViews.referrer, n: sql<number>`count(*)` })
    .from(pageViews)
    .where(and(gte(pageViews.createdAt, since30), isNotNull(pageViews.referrer)))
    .groupBy(pageViews.referrer)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  const dailyRows = await db
    .select({ day: dayExpr, n: sql<number>`count(*)` })
    .from(pageViews)
    .where(gte(pageViews.createdAt, since14))
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  // Fill a contiguous 14-day series (days with no views → 0) for a clean chart.
  const counts = new Map(dailyRows.map((d) => [d.day, d.n]));
  const daily: { day: string; n: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    daily.push({ day, n: counts.get(day) ?? 0 });
  }

  return {
    total: total?.n ?? 0,
    last7: last7?.n ?? 0,
    last30: last30?.n ?? 0,
    topPaths,
    topReferrers,
    daily,
  };
}
