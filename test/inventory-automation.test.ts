import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products, orders, settings, newsletterCampaigns } from "@/lib/db/schema";
import { isLowStock, reorderPointFor, margin } from "@/lib/inventory";
import { runPickupAutoFulfil, automationTrouble, CRON_JOBS } from "@/lib/automation";
import { runDueCampaigns, campaignBodyHtml } from "@/lib/newsletter-campaigns";
import { resolveSlug, slugify } from "@/lib/slug";

const SHOP = "inv-shop";

async function setSetting(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Inventario", specialty: "Test", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });
});

describe("isLowStock / reorderPointFor", () => {
  it("falls back to the shop-wide threshold when a product has no reorder point", () => {
    expect(reorderPointFor({ reorderPoint: null }, 5)).toBe(5);
    expect(isLowStock({ stock: 5, reorderPoint: null }, 5)).toBe(true);
    expect(isLowStock({ stock: 6, reorderPoint: null }, 5)).toBe(false);
  });

  it("prefers the product's own reorder point in both directions", () => {
    // Higher than the default: a fast mover alerts sooner.
    expect(isLowStock({ stock: 15, reorderPoint: 20 }, 5)).toBe(true);
    // Lower than the default: a slow mover stops crying wolf.
    expect(isLowStock({ stock: 3, reorderPoint: 1 }, 5)).toBe(false);
  });

  it("never treats an untracked stock as low", () => {
    expect(isLowStock({ stock: null, reorderPoint: 99 }, 5)).toBe(false);
  });
});

describe("margin", () => {
  it("compares cost against the VAT-exclusive base, not the shelf price", () => {
    // 11,00 € gross at 10% VAT → 10,00 € net. Cost 6,00 € → 4,00 € (40%).
    const m = margin({ priceCents: 1100, costCents: 600, vatRateBps: 1000 });
    expect(m).toEqual({ netCents: 1000, marginCents: 400, marginPct: 40 });
  });

  it("reports a negative margin when the cost exceeds the net price", () => {
    const m = margin({ priceCents: 1100, costCents: 1200, vatRateBps: 1000 });
    expect(m?.marginCents).toBe(-200);
    expect(m?.marginPct).toBe(-20);
  });

  it("returns null without a price or a cost", () => {
    expect(margin({ priceCents: null, costCents: 500, vatRateBps: 1000 })).toBeNull();
    expect(margin({ priceCents: 1000, costCents: null, vatRateBps: 1000 })).toBeNull();
  });
});

describe("runPickupAutoFulfil", () => {
  const NOW = new Date("2026-08-01T10:00:00Z");
  const oldEnough = new Date("2026-07-20T10:00:00Z"); // 12 days before NOW
  const recent = new Date("2026-07-31T10:00:00Z"); // 1 day before NOW

  // One fixture is a shipping order with no shopSlug, so clear by order number
  // rather than by shop.
  const NUMBERS = ["AF-1", "AF-2", "AF-3", "AF-4"];

  beforeEach(async () => {
    await db.delete(orders).where(inArray(orders.orderNumber, NUMBERS));
    await setSetting("orders.autoFulfilPickupDays", 0);
  });

  async function seed() {
    await db.insert(orders).values([
      // Paid pickup, stale → should close.
      { orderNumber: "AF-1", email: "a@x.it", name: "A", status: "paid", paymentStatus: "paid", fulfilment: "pickup", shopSlug: SHOP, updatedAt: oldEnough },
      // Paid pickup but recent → left alone.
      { orderNumber: "AF-2", email: "b@x.it", name: "B", status: "paid", paymentStatus: "paid", fulfilment: "pickup", shopSlug: SHOP, updatedAt: recent },
      // Stale but unpaid → not ours to close.
      { orderNumber: "AF-3", email: "c@x.it", name: "C", status: "pending", paymentStatus: "unpaid", fulfilment: "pickup", shopSlug: SHOP, updatedAt: oldEnough },
      // Stale and paid, but a shipping order → closed by tracking, not by time.
      { orderNumber: "AF-4", email: "d@x.it", name: "D", status: "paid", paymentStatus: "paid", fulfilment: "shipping", updatedAt: oldEnough },
    ]);
  }

  it("does nothing while the setting is 0", async () => {
    await seed();
    expect(await runPickupAutoFulfil(NOW)).toEqual({ fulfilled: 0, afterDays: 0 });
    const [row] = await db.select().from(orders).where(eq(orders.orderNumber, "AF-1"));
    expect(row.status).toBe("paid");
  });

  it("closes only stale, paid pickup orders", async () => {
    await seed();
    await setSetting("orders.autoFulfilPickupDays", 7);

    const res = await runPickupAutoFulfil(NOW);
    expect(res).toEqual({ fulfilled: 1, afterDays: 7 });

    const byNumber = async (n: string) =>
      (await db.select().from(orders).where(eq(orders.orderNumber, n)))[0];
    expect((await byNumber("AF-1")).status).toBe("fulfilled");
    expect((await byNumber("AF-2")).status).toBe("paid");
    expect((await byNumber("AF-3")).status).toBe("pending");
    expect((await byNumber("AF-4")).status).toBe("paid");
  });
});

describe("newsletter campaigns", () => {
  beforeEach(async () => {
    await db.delete(newsletterCampaigns);
  });

  it("escapes HTML in the composed body", () => {
    const html = campaignBodyHtml("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("turns blank lines into paragraphs and single newlines into breaks", () => {
    const html = campaignBodyHtml("uno\ndue\n\ntre");
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain("uno<br>due");
  });

  it("sends only campaigns that are scheduled and due", async () => {
    const now = new Date("2026-08-01T12:00:00Z");
    await db.insert(newsletterCampaigns).values([
      { subject: "Dovuta", body: "x", status: "scheduled", scheduledFor: new Date("2026-08-01T09:00:00Z") },
      { subject: "Futura", body: "x", status: "scheduled", scheduledFor: new Date("2026-08-02T09:00:00Z") },
      { subject: "Bozza", body: "x", status: "draft" },
    ]);

    const res = await runDueCampaigns(now);
    expect(res.sent).toBe(1);

    const rows = await db.select().from(newsletterCampaigns);
    const byName = (s: string) => rows.find((r) => r.subject === s)!;
    expect(byName("Dovuta").status).toBe("sent");
    expect(byName("Dovuta").sentAt).not.toBeNull();
    expect(byName("Futura").status).toBe("scheduled");
    expect(byName("Bozza").status).toBe("draft");
  });

  it("does not re-send an already sent campaign", async () => {
    const now = new Date("2026-08-01T12:00:00Z");
    await db.insert(newsletterCampaigns).values({
      subject: "Ripetuta",
      body: "x",
      status: "scheduled",
      scheduledFor: new Date("2026-08-01T09:00:00Z"),
    });

    expect((await runDueCampaigns(now)).sent).toBe(1);
    // A second sweep finds nothing still scheduled.
    expect((await runDueCampaigns(now)).sent).toBe(0);
  });
});

describe("slug derivation", () => {
  it("strips accents and punctuation", () => {
    expect(slugify("Porchetta d'Ariccia — 1kg!")).toBe("porchetta-d-ariccia-1kg");
  });

  it("derives from the name and numbers a collision instead of going random", async () => {
    await db.delete(products).where(eq(products.shopSlug, SHOP));
    await db.insert(products).values({ slug: "salame-test", name: "Salame Test", shopSlug: SHOP });

    const first = await resolveSlug({
      table: products,
      slugColumn: products.slug,
      idColumn: products.id,
      fallbackText: "Salame Test",
    });
    expect(first).toBe("salame-test-2");

    // An explicit slug always wins.
    const explicit = await resolveSlug({
      table: products,
      slugColumn: products.slug,
      idColumn: products.id,
      explicit: "mio-slug",
      fallbackText: "Salame Test",
    });
    expect(explicit).toBe("mio-slug");
  });

  it("lets a record keep its own slug on update", async () => {
    await db.delete(products).where(eq(products.shopSlug, SHOP));
    const [row] = await db
      .insert(products)
      .values({ slug: "lardo-test", name: "Lardo Test", shopSlug: SHOP })
      .returning({ id: products.id });

    const slug = await resolveSlug({
      table: products,
      slugColumn: products.slug,
      idColumn: products.id,
      fallbackText: "Lardo Test",
      excludeId: row.id,
    });
    expect(slug).toBe("lardo-test");
  });
});

/**
 * A job that fails has to reach the one message the owner actually reads.
 *
 * The run records were written faithfully and displayed in exactly one place —
 * a panel on /admin/settings, which nobody opens. So a job that started
 * throwing every night went on throwing every night, and the first anybody
 * heard of it was a customer saying nobody had called.
 */
describe("automationTrouble", () => {
  beforeEach(async () => {
    for (const job of CRON_JOBS) await setSetting(`cron.lastRun.${job.key}`, null);
  });

  it("says nothing on a healthy morning", async () => {
    const now = new Date();
    for (const job of CRON_JOBS) {
      await setSetting(`cron.lastRun.${job.key}`, { at: now.toISOString(), ok: true });
    }
    expect(await automationTrouble(now)).toEqual([]);
  });

  it("names a job that failed, and why", async () => {
    const now = new Date();
    await setSetting(`cron.lastRun.porchetta-reminders`, {
      at: now.toISOString(),
      ok: false,
      error: "SMTP irraggiungibile",
    });
    const trouble = await automationTrouble(now);
    expect(trouble).toHaveLength(1);
    expect(trouble[0]!.detail).toBe("SMTP irraggiungibile");
  });

  it("names a job that has gone quiet", async () => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);
    await setSetting(`cron.lastRun.maintenance`, { at: threeDaysAgo.toISOString(), ok: true });

    const trouble = await automationTrouble(now);
    expect(trouble).toHaveLength(1);
    expect(trouble[0]!.detail).toMatch(/3 giorni/);
  });

  it("does not complain about a job that has simply never run", async () => {
    // Pickup auto-close and points expiry both idle until they are configured;
    // silence there is a setting, not a fault.
    expect(await automationTrouble(new Date())).toEqual([]);
  });
});
