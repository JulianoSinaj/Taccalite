import { describe, it, expect, beforeEach } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailOutbox, newsletterCampaigns } from "@/lib/db/schema";
import { outboxFilters, outboxWhere, filterQuery } from "@/lib/admin/filters";
import { getOutboxPage, getOutboxSummary, getOutboxForExport } from "@/lib/admin/queries";
import { drainOutbox, orderEmailDelivery, OUTBOX_MAX_ATTEMPTS } from "@/lib/mail/mailer";
import { runMaintenance } from "@/lib/automation";

/** Every fixture address ends in this, so other suites' mail never leaks in. */
const DOMAIN = "@outbox-test.local";
const to = (name: string) => `${name}${DOMAIN}`;

const CAMPAIGN = "outbox-test-campaign";

/** Only the rows this suite created. */
const mine = <T extends { toAddress: string }>(rows: T[]): T[] => rows.filter((r) => r.toAddress.endsWith(DOMAIN));

async function seed() {
  await db.delete(emailOutbox).where(like(emailOutbox.toAddress, `%${DOMAIN}`));
  await db
    .insert(newsletterCampaigns)
    .values({ id: CAMPAIGN, subject: "Offerta di settembre", body: "…" })
    .onConflictDoNothing({ target: newsletterCampaigns.id });

  const day = (iso: string) => new Date(`${iso}T10:00:00+02:00`);
  await db.insert(emailOutbox).values([
    { toAddress: to("anna"), subject: "Ordine confermato · ORD-1001", status: "sent", attempts: 1, sentAt: day("2026-08-01"), createdAt: day("2026-08-01") },
    { toAddress: to("bruno"), subject: "Ordine ricevuto · ORD-1002", status: "queued", attempts: 0, createdAt: day("2026-08-02") },
    { toAddress: to("carla"), subject: "Prenotazione tavolo", status: "failed", attempts: 2, error: "451 try later", createdAt: day("2026-08-03") },
    { toAddress: to("dario"), subject: "Reimposta la password", status: "failed", attempts: OUTBOX_MAX_ATTEMPTS, error: "550 no such user", createdAt: day("2026-08-04") },
    { toAddress: to("elena"), subject: "Offerta di settembre", status: "sent", attempts: 1, campaignId: CAMPAIGN, sentAt: day("2026-08-05"), createdAt: day("2026-08-05") },
    { toAddress: to("fabio"), subject: "Offerta di settembre", status: "failed", attempts: 1, campaignId: CAMPAIGN, error: "550", createdAt: day("2026-08-05") },
  ]);
}

beforeEach(seed);

describe("outboxFilters", () => {
  it("defaults status to 'all' and reads every facet", () => {
    expect(outboxFilters({})).toEqual({ stato: "all", q: undefined, id: undefined, campaign: undefined, da: undefined, a: undefined });
    expect(outboxFilters({ stato: "failed", q: " anna ", id: "x", campaign: "c", da: "2026-08-01", a: "2026-08-03" })).toEqual({
      stato: "failed",
      q: "anna",
      id: "x",
      campaign: "c",
      da: "2026-08-01",
      a: "2026-08-03",
    });
  });

  it("falls back to 'all' for an unknown status instead of matching nothing", () => {
    expect(outboxFilters({ stato: "bogus" }).stato).toBe("all");
    expect(outboxWhere(outboxFilters({ stato: "bogus" }))).toBeUndefined();
  });

  it("round-trips through filterQuery without the catch-all", () => {
    expect(filterQuery(outboxFilters({ stato: "all", campaign: CAMPAIGN }))).toBe(`?campaign=${CAMPAIGN}`);
  });
});

describe("getOutboxPage", () => {
  // The chip counts and the whole-outbox failure figures live in
  // `getOutboxSummary`, separately from the rows, so the page can render its
  // chrome before the list arrives.
  it("counts per status under the other filters, and the whole-outbox failures separately", async () => {
    const page = await getOutboxPage({ stato: "all", q: DOMAIN });
    expect(mine(page.rows)).toHaveLength(6);
    const summary = await getOutboxSummary({ stato: "all", q: DOMAIN });
    expect(summary.counts).toEqual({ all: 6, queued: 1, sent: 2, failed: 3 });

    // Chip counts ignore the status facet — "Fallite (3)" stays 3 while viewing sent.
    const sent = await getOutboxPage({ stato: "sent", q: DOMAIN });
    expect(mine(sent.rows).map((r) => r.status)).toEqual(["sent", "sent"]);
    expect((await getOutboxSummary({ stato: "sent", q: DOMAIN })).counts.failed).toBe(3);

    expect(summary.failed).toBeGreaterThanOrEqual(3);
    expect(summary.exhausted).toBeGreaterThanOrEqual(1);
  });

  it("searches recipient and subject case-insensitively", async () => {
    const byAddress = await getOutboxPage({ q: "CARLA" + DOMAIN });
    expect(mine(byAddress.rows).map((r) => r.toAddress)).toEqual([to("carla")]);
    const bySubject = await getOutboxPage({ q: "ord-100" });
    expect(mine(bySubject.rows).map((r) => r.subject).sort()).toEqual([
      "Ordine confermato · ORD-1001",
      "Ordine ricevuto · ORD-1002",
    ]);
  });

  it("filters by id, campaign and date range", async () => {
    const [bruno] = await db.select({ id: emailOutbox.id }).from(emailOutbox).where(eq(emailOutbox.toAddress, to("bruno")));
    const one = await getOutboxPage({ id: bruno.id });
    expect(one.rows.map((r) => r.toAddress)).toEqual([to("bruno")]);

    const camp = await getOutboxPage({ campaign: CAMPAIGN });
    expect(mine(camp.rows).map((r) => r.toAddress).sort()).toEqual([to("elena"), to("fabio")]);
    expect(camp.campaigns[CAMPAIGN]).toBe("Offerta di settembre");

    const range = await getOutboxPage({ q: DOMAIN, da: "2026-08-02", a: "2026-08-03" });
    expect(mine(range.rows).map((r) => r.toAddress).sort()).toEqual([to("bruno"), to("carla")]);
  });

  it("labels the active campaign filter even when nothing matches it", async () => {
    const page = await getOutboxPage({ campaign: CAMPAIGN, stato: "queued" });
    expect(mine(page.rows)).toHaveLength(0);
    expect(page.campaigns[CAMPAIGN]).toBe("Offerta di settembre");
  });
});

describe("getOutboxForExport", () => {
  it("returns the filtered rows without bodies, newest first", async () => {
    const rows = mine(await getOutboxForExport({ stato: "failed", q: DOMAIN }, 100, 0));
    expect(rows.map((r) => r.toAddress)).toEqual([to("fabio"), to("dario"), to("carla")]);
    expect(rows[0]).not.toHaveProperty("html");
    expect(rows[0]).not.toHaveProperty("text");
    expect(rows[0].campaignId).toBe(CAMPAIGN);
  });
});

describe("mailer", () => {
  it("drainOutbox is a no-op without SMTP and leaves the queue untouched", async () => {
    expect(await drainOutbox()).toEqual({ attempted: 0, sent: 0, remaining: 0 });
    const [bruno] = await db.select().from(emailOutbox).where(eq(emailOutbox.toAddress, to("bruno")));
    expect(bruno.status).toBe("queued");
    expect(bruno.attempts).toBe(0);
  });

  it("orderEmailDelivery reports the state of the customer's copy", async () => {
    expect(await orderEmailDelivery("ORD-1001", to("anna"))).toBe("sent");
    expect(await orderEmailDelivery("ORD-1002", to("bruno"))).toBe("pending");
    expect(await orderEmailDelivery("ORD-1002", to("nobody"))).toBe("none");
  });
});

/**
 * Every outbox row holds the message body in full — for an order confirmation
 * that is the customer's name, delivery address, phone and basket. Pruning only
 * the delivered ones meant a message that exhausted its retries sat there with
 * all of that in it forever, and on an install where SMTP was never configured
 * every message stays `queued`, so the table grew without bound as a store of
 * personal data nobody had decided to keep.
 */
describe("outbox retention", () => {
  const OLD = new Date(Date.now() - 200 * 86_400_000);
  const RECENT = new Date(Date.now() - 2 * 86_400_000);

  it("prunes an old row whatever its status, and keeps recent ones", async () => {
    await db.delete(emailOutbox).where(like(emailOutbox.toAddress, "retention-%"));
    await db.insert(emailOutbox).values([
      { toAddress: "retention-sent@example.com", subject: "s", status: "sent", createdAt: OLD },
      { toAddress: "retention-failed@example.com", subject: "f", status: "failed", createdAt: OLD, attempts: 5 },
      { toAddress: "retention-queued@example.com", subject: "q", status: "queued", createdAt: OLD },
      { toAddress: "retention-recent@example.com", subject: "r", status: "failed", createdAt: RECENT },
    ]);

    await runMaintenance(new Date(), 90);

    const left = await db
      .select({ to: emailOutbox.toAddress })
      .from(emailOutbox)
      .where(like(emailOutbox.toAddress, "retention-%"));
    expect(left.map((r) => r.to)).toEqual(["retention-recent@example.com"]);
  });
});
