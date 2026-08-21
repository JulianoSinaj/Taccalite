/**
 * CSV serialization with RFC-4180 quoting and spreadsheet formula-injection
 * neutralization.
 *
 * A cell that a spreadsheet would interpret as a formula (leading `= + - @`, or a
 * leading tab/CR) is prefixed with a single quote so Excel/Google Sheets treat it
 * as text rather than executing it — important because admin CSV exports carry
 * user-controlled fields (names, emails, notes).
 */
export type CsvCell = string | number | null | undefined;

export function csvEscape(value: CsvCell): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

/** One CSV record, CRLF-terminated — the unit a streaming export writes. */
export function csvRow(cells: CsvCell[]): string {
  return `${cells.map(csvEscape).join(",")}\r\n`;
}

/**
 * How many rows a streaming export pulls from the database at a time. Small
 * enough that no single batch is a memory problem, large enough that a big
 * export isn't dominated by round-trips.
 */
export const EXPORT_BATCH = 500;

/**
 * Serialize an arbitrarily large result set as a CSV stream.
 *
 * The exports used to select every matching row at once, map the lot into a
 * second in-memory array and join that into one big string — three copies of an
 * unbounded result set, on a serverless function with a fixed memory limit. An
 * audit log or order history large enough to be worth exporting is exactly the
 * one that would fail to.
 *
 * `fetchPage` is called with a limit/offset as the consumer drains the stream,
 * so only one batch is ever resident. It must impose a **total** order (a unique
 * tiebreaker, not just a timestamp) or offset paging can repeat or skip rows
 * across batch boundaries. Rows written concurrently with a long export can
 * still shift between pages; for an admin download that is an acceptable trade
 * against holding the whole set in memory.
 *
 * A mid-stream failure calls `controller.error`, which aborts the HTTP body
 * rather than letting a truncated file look like a complete one — for audit and
 * fiscal data, a download that stops short must not pass for the real thing.
 */
export function streamCsv<T>(
  headers: string[],
  fetchPage: (limit: number, offset: number) => Promise<T[]>,
  mapRow: (row: T) => CsvCell[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let offset = 0;
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(csvRow(headers)));
    },
    async pull(controller) {
      try {
        const rows = await fetchPage(EXPORT_BATCH, offset);
        offset += rows.length;
        if (rows.length > 0) {
          controller.enqueue(encoder.encode(rows.map((r) => csvRow(mapRow(r))).join("")));
        }
        // A short batch means the source is exhausted; only a full one can have
        // more behind it.
        if (rows.length < EXPORT_BATCH) controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
