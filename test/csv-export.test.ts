import { describe, it, expect, beforeAll } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsletterSubscribers } from "@/lib/db/schema";
import { getSubscribersForExport } from "@/lib/admin/queries";
import { streamCsv, toCsv, csvRow, EXPORT_BATCH } from "@/lib/csv";

/**
 * Streaming CSV export.
 *
 * The exports used to select every matching row at once and join the lot into a
 * single string. These cover the thing that replaced it: that paging the query
 * a batch at a time yields every row exactly once, that an empty result still
 * produces a header, and that a failure part-way through aborts rather than
 * passing a truncated file off as a complete one.
 *
 * What these do NOT prove is the `id` tiebreaker on the export ORDER BY. Offset
 * paging over a non-total order may repeat one row and drop another at a batch
 * boundary, but SQLite happens to return equal-keyed rows consistently here, so
 * removing the tiebreaker does not fail this suite. It stays because the order
 * is *unspecified* without it — a different plan, index or SQLite version may
 * legitimately change it — not because a test caught it.
 */

const DOMAIN = "csvstream.example";
const TOTAL = EXPORT_BATCH * 2 + 37; // spans three batches, last one partial

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

beforeAll(async () => {
  await db.delete(newsletterSubscribers).where(like(newsletterSubscribers.email, `%@${DOMAIN}`));
  // One timestamp for every row, so the sort key is a tie throughout and the
  // batching is exercised against the shape where order stability matters.
  const createdAt = new Date("2026-03-01T10:00:00Z");
  const rows = Array.from({ length: TOTAL }, (_, i) => ({
    email: `iscritto-${String(i).padStart(4, "0")}@${DOMAIN}`,
    token: `tok-${i}`,
    source: "test-stream",
    createdAt,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(newsletterSubscribers).values(rows.slice(i, i + 200));
  }
});

describe("streamCsv", () => {
  it("emits every row exactly once across batch boundaries", async () => {
    const csv = await drain(
      streamCsv(
        ["email", "status", "source"],
        (limit, offset) => getSubscribersForExport({ q: `@${DOMAIN}` }, limit, offset),
        (s) => [s.email, s.status, s.source],
      ),
    );

    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("email,status,source");

    const emails = lines.slice(1).map((l) => l.split(",")[0]);
    expect(emails).toHaveLength(TOTAL);
    // A duplicate or a gap would mean the batching lost track of its position.
    expect(new Set(emails).size).toBe(TOTAL);
  });

  it("writes a header and nothing else when the filter matches no rows", async () => {
    const csv = await drain(
      streamCsv(
        ["email"],
        (limit, offset) => getSubscribersForExport({ q: "@nessuno.invalid" }, limit, offset),
        (s) => [s.email],
      ),
    );
    expect(csv).toBe("email\r\n");
  });

  it("propagates a mid-stream failure instead of truncating silently", async () => {
    const boom = new Error("query failed");
    const stream = streamCsv<{ a: string }>(
      ["a"],
      async (_limit, offset) => {
        if (offset > 0) throw boom;
        return Array.from({ length: EXPORT_BATCH }, (_, i) => ({ a: `r${i}` }));
      },
      (r) => [r.a],
    );
    await expect(drain(stream)).rejects.toThrow("query failed");
  });
});

describe("csvRow", () => {
  it("escapes exactly as the non-streaming serializer does", () => {
    const cells = ["=SUM(A1)", 'quote"inside', "comma,inside", null, 12];
    expect(csvRow(cells)).toBe(`${toCsv([], [cells]).trimStart()}\r\n`);
  });
});
