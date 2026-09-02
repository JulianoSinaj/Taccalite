import { describe, it, expect, beforeEach } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailOutbox, newsletterSubscribers } from "@/lib/db/schema";
import { broadcastToSubscribers } from "@/lib/automation";
import { newsletterBroadcast } from "@/lib/mail/templates";
import { resolveSegment } from "@/lib/segments";

/**
 * A marketing send has to carry an unsubscribe the recipient can act on and one
 * their mail client can act on.
 *
 * The visible link was already in both the HTML and the text part. The
 * machine-readable half was missing entirely: Gmail and Yahoo have required
 * `List-Unsubscribe` and `List-Unsubscribe-Post` from bulk senders since
 * February 2024, and without them a newsletter's deliverability degrades and it
 * starts arriving in spam — a slow failure nobody attributes to a header.
 */

const SOURCE = "bcast-test-source";
const CONFIRMED = "bcast-confirmed@example.com";
const PENDING = "bcast-pending@example.com";

beforeEach(async () => {
  await db.delete(emailOutbox).where(like(emailOutbox.toAddress, "bcast-%"));
  await db.delete(newsletterSubscribers).where(like(newsletterSubscribers.email, "bcast-%"));
  await db.insert(newsletterSubscribers).values([
    { email: CONFIRMED, token: "bcast-tok-confirmed", status: "confirmed", source: SOURCE },
    { email: PENDING, token: "bcast-tok-pending", status: "pending", source: SOURCE },
  ]);
});

describe("broadcastToSubscribers", () => {
  it("enqueues one message per confirmed subscriber, and none for the unconfirmed", async () => {
    const res = await broadcastToSubscribers("Novità", "<p>Ciao</p>", { source: SOURCE });
    expect(res.queued).toBe(1);

    const rows = await db.select().from(emailOutbox).where(like(emailOutbox.toAddress, "bcast-%"));
    expect(rows.map((r) => r.toAddress)).toEqual([CONFIRMED]);
  });

  it("stores the recipient's own unsubscribe URL for the List-Unsubscribe header", async () => {
    await broadcastToSubscribers("Novità", "<p>Ciao</p>", { source: SOURCE });

    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.toAddress, CONFIRMED));
    // Per-subscriber, and persisted — the drain re-sends from this row long
    // after the broadcast, and the URL carries that subscriber's token.
    expect(row!.listUnsubscribeUrl).toContain("bcast-tok-confirmed");
    expect(row!.listUnsubscribeUrl).toContain("/api/newsletter/unsubscribe");
  });

  it("leaves transactional mail without one", async () => {
    // Nobody opts out of their own order confirmation, and telling a mail
    // client they can would be worse than saying nothing.
    const { sendMail } = await import("@/lib/mail/mailer");
    await sendMail({
      to: "bcast-transactional@example.com",
      subject: "Ordine",
      html: "<p>Grazie</p>",
      text: "Grazie",
    });
    const [row] = await db
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.toAddress, "bcast-transactional@example.com"));
    expect(row!.listUnsubscribeUrl).toBeNull();
  });
});

describe("newsletterBroadcast", () => {
  it("puts the unsubscribe link in the text part as well as the HTML", () => {
    const built = newsletterBroadcast("Oggetto", "<p>Corpo</p>", "https://example.test/unsub");
    expect(built.html).toContain("https://example.test/unsub");
    expect(built.text).toContain("https://example.test/unsub");
  });
});

describe("resolveSegment", () => {
  it("only ever resolves confirmed subscribers", async () => {
    const members = await resolveSegment({ source: SOURCE });
    expect(members.map((m) => m.email)).toEqual([CONFIRMED]);
  });
});
