import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pageViews } from "@/lib/db/schema";
import { getAnalyticsSummary } from "@/lib/analytics";

/**
 * The daily visits series — which day a visit is counted on.
 *
 * SQLite has no timezone database, so the series used to be grouped with
 * `date(created_at / 1000, 'unixepoch')` and filled from `toISOString()`: both
 * UTC. A visit at 00:30 in Ancona was therefore charted on the previous day,
 * while "Incasso oggi" beside it resolved Rome — the two halves of the same
 * screen disagreed about when the day started.
 *
 * `TZ` is pinned per case so the assertions mean the same thing on an Italian
 * laptop and on the UTC container the app actually ships in.
 */

const REAL_TZ = process.env.TZ;

afterEach(async () => {
  process.env.TZ = REAL_TZ;
  await db.delete(pageViews);
});

beforeEach(async () => {
  await db.delete(pageViews);
});

/** Run `fn` as if the server's clock were in `tz`. */
async function asServerIn<T>(tz: string, fn: () => Promise<T>): Promise<T> {
  process.env.TZ = tz;
  return fn();
}

async function view(at: string, path = "/") {
  await db.insert(pageViews).values({ path, createdAt: new Date(at) });
}

/** The count charted on `day` for a window ending on `now`. */
async function countOn(now: Date, day: string, range = 7): Promise<number | undefined> {
  const s = await getAnalyticsSummary(now, range);
  return s.daily.find((d) => d.day === day)?.n;
}

describe("daily series — a visit is charted on the Rome day it happened", () => {
  it("counts a 00:30 visit on that day, not the one before (CEST, +2)", async () => {
    // 00:30 on 2 September in Ancona is 22:30Z on 1 September.
    await view("2026-09-01T22:30:00Z");
    await asServerIn("UTC", async () => {
      const now = new Date("2026-09-02T10:00:00Z");
      expect(await countOn(now, "2026-09-02")).toBe(1);
      expect(await countOn(now, "2026-09-01")).toBe(0);
    });
  });

  it("counts a 00:30 visit on that day, not the one before (CET, +1)", async () => {
    // 00:30 on 2 February in Ancona is 23:30Z on 1 February.
    await view("2026-02-01T23:30:00Z");
    await asServerIn("UTC", async () => {
      const now = new Date("2026-02-02T10:00:00Z");
      expect(await countOn(now, "2026-02-02")).toBe(1);
      expect(await countOn(now, "2026-02-01")).toBe(0);
    });
  });

  it("keeps a 23:30 visit on its own day", async () => {
    // 23:30 on 1 September in Ancona is 21:30Z the same day.
    await view("2026-09-01T21:30:00Z");
    await asServerIn("UTC", async () => {
      const now = new Date("2026-09-02T10:00:00Z");
      expect(await countOn(now, "2026-09-01")).toBe(1);
      expect(await countOn(now, "2026-09-02")).toBe(0);
    });
  });

  it("splits two visits either side of Rome midnight onto two days", async () => {
    await view("2026-09-01T21:59:00Z"); // 23:59 Rome, 1 Sep
    await view("2026-09-01T22:01:00Z"); // 00:01 Rome, 2 Sep
    await asServerIn("UTC", async () => {
      const now = new Date("2026-09-02T10:00:00Z");
      expect(await countOn(now, "2026-09-01")).toBe(1);
      expect(await countOn(now, "2026-09-02")).toBe(1);
    });
  });

  it("buckets correctly on both sides of the October DST change", async () => {
    // Rome leaves CEST at 03:00 on 25 October 2026. A fixed +2 offset would put
    // the second visit on the 26th.
    await view("2026-10-24T22:30:00Z"); // 00:30 Rome, 25 Oct (still +2)
    await view("2026-10-25T23:30:00Z"); // 00:30 Rome, 26 Oct (now +1)
    await asServerIn("UTC", async () => {
      const now = new Date("2026-10-26T10:00:00Z");
      expect(await countOn(now, "2026-10-25")).toBe(1);
      expect(await countOn(now, "2026-10-26")).toBe(1);
    });
  });
});

describe("daily series — shape of the window", () => {
  it("covers exactly `range` whole Rome days, ending today", async () => {
    await asServerIn("UTC", async () => {
      const s = await getAnalyticsSummary(new Date("2026-09-10T10:00:00Z"), 7);
      expect(s.daily).toHaveLength(7);
      expect(s.daily[0].day).toBe("2026-09-04");
      expect(s.daily[6].day).toBe("2026-09-10");
    });
  });

  it("agrees with the headline total over the same window", async () => {
    await view("2026-09-04T00:30:00Z"); // 02:30 Rome, first day of the window
    await view("2026-09-07T12:00:00Z");
    await view("2026-09-10T20:00:00Z"); // 22:00 Rome on the last day
    await asServerIn("UTC", async () => {
      // 23:00 Rome on the 10th — still the 10th. (22:00Z would already be the
      // 11th in Ancona, which is the whole point of the fix.)
      const s = await getAnalyticsSummary(new Date("2026-09-10T21:00:00Z"), 7);
      const charted = s.daily.reduce((sum, d) => sum + d.n, 0);
      // The bars used to under-count the headline: the window opened mid-day,
      // so its first bar was a part-day the total counted in full.
      expect(charted).toBe(s.views);
      expect(charted).toBe(3);
    });
  });

  it("groups the views by hour instead of returning one row each", async () => {
    // Four views inside two hours must come back as two rows. If the divisor is
    // ever interpolated from a JS constant it is bound as a REAL, `/` becomes
    // float division, and the GROUP BY collapses nothing — the page still shows
    // the right numbers while the query drags back every row in the window.
    const base = Date.UTC(2026, 8, 1, 11, 0, 0);
    for (const offset of [0, 60_000, 1_200_000, 3_600_000]) {
      await db.insert(pageViews).values({ path: "/", createdAt: new Date(base + offset) });
    }
    const rows = await db
      .select({ hour: sql<number>`(${pageViews.createdAt} / 3600000) * 3600000`, n: sql<number>`count(*)` })
      .from(pageViews)
      .groupBy(sql`(${pageViews.createdAt} / 3600000) * 3600000`);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.n).sort()).toEqual([1, 3]);

    // …and the source still writes that divisor out, which is what makes it so.
    const source = readFileSync("lib/analytics.ts", "utf8");
    expect(source).toContain("/ 3600000) * 3600000");
  });

  it("keeps the chart columns full-height so a bar's percentage means something", () => {
    // A percentage height needs a definite height to resolve against. With
    // `items-end` on the row each column was sized to its own content, so every
    // bar computed to `auto` and rendered at the 4px `minHeight` — the chart was
    // a flat row of stubs whatever the numbers said, and nothing failed.
    // Asserted on the source because the defect is layout, not data: it is
    // invisible to a DOM query (the style attribute still reads "100%") and only
    // shows up in a measured bounding box.
    const page = readFileSync("app/admin/(dash)/analytics/page.tsx", "utf8");
    expect(page).toContain("flex h-40 items-stretch gap-1");
    expect(page).not.toContain("flex h-40 items-end");
    // …and the bar sits in its own flex-1 track, so the day label keeps its row.
    expect(page).toContain("flex w-full flex-1 items-end");
  });

  it("leaves a visit before the window out of both the series and the total", async () => {
    await view("2026-09-03T12:00:00Z"); // the day before the window opens
    await asServerIn("UTC", async () => {
      const s = await getAnalyticsSummary(new Date("2026-09-10T10:00:00Z"), 7);
      expect(s.daily.reduce((sum, d) => sum + d.n, 0)).toBe(0);
      expect(s.views).toBe(0);
      // Still counted in the previous window, which it belongs to.
      expect(s.viewsPrev).toBe(1);
    });
  });
});
