import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";

/**
 * Index-backed search for the admin lists.
 *
 * Each searchable table has a trigram FTS5 index (see `drizzle/0024_fts_search.sql`).
 * Trigram matches substrings, so results are identical to the `LIKE '%term%'`
 * scans this replaced — "ossi" still finds "Rossi", case-insensitively.
 *
 * Two things trigram can't do, both handled here:
 *  - terms shorter than 3 characters produce no trigrams, so those fall back to
 *    LIKE (a 1–2 character search matches most rows anyway, so the scan is not
 *    the expensive part);
 *  - it indexes one table, so a search spanning a joined table (the loyalty card
 *    number on the customer list) keeps its own LIKE branch, OR-ed in by the caller.
 */

/** FTS index names, keyed by the table they mirror. */
export const FTS_TABLES = {
  orders: "orders_fts",
  reservations: "reservations_fts",
  users: "users_fts",
  newsletter_subscribers: "newsletter_subscribers_fts",
  audit_log: "audit_log_fts",
} as const;

export type FtsTable = keyof typeof FTS_TABLES;

/** Trigram needs at least this many characters to produce a token. */
export const MIN_FTS_LENGTH = 3;

export function usesFts(term: string): boolean {
  return term.trim().length >= MIN_FTS_LENGTH;
}

/**
 * Quote a user's term as a single FTS5 string literal.
 *
 * Everything the user typed is treated as literal text — doubling embedded
 * quotes is what stops `"` or an operator like `OR`/`NEAR` from being parsed as
 * query syntax (or throwing a malformed-query error on a stray bracket).
 */
function ftsLiteral(term: string): string {
  return `"${term.trim().replace(/"/g, '""')}"`;
}

/**
 * A predicate restricting a table to rows matching `term`, via its FTS index.
 *
 * Returns null when the term is too short for trigram — the caller then uses its
 * LIKE fallback. Matching is done on rowid, which is how the external-content
 * index links back to the base table.
 */
export function ftsMatch(table: FtsTable, term: string): SQL | null {
  if (!usesFts(term)) return null;
  const index = FTS_TABLES[table];
  // The index name can't be parameterised; it comes from the frozen map above,
  // never from user input.
  return sql.raw(
    `"${table}".rowid IN (SELECT rowid FROM ${index} WHERE ${index} MATCH ${quoteSqlString(ftsLiteral(term))})`,
  );
}

/** Single-quote a string for inlining into raw SQL. */
function quoteSqlString(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}

/**
 * Verify each FTS index against its content table and rebuild any that drifted.
 *
 * External-content FTS is linked by rowid, which SQLite can renumber on VACUUM.
 * Nothing in this codebase VACUUMs, so this should never find a problem — it is
 * a cheap self-heal so a stale index degrades to "rebuilt once" instead of
 * "search silently returns wrong rows". Called from the maintenance job.
 */
export async function verifySearchIndexes(): Promise<{ checked: number; rebuilt: string[] }> {
  const rebuilt: string[] = [];
  for (const index of Object.values(FTS_TABLES)) {
    try {
      // 'integrity-check' raises SQLITE_CORRUPT_VTAB when the index disagrees
      // with its content table.
      db.$client.prepare(`INSERT INTO ${index}(${index}) VALUES('integrity-check')`).run();
    } catch {
      db.$client.prepare(`INSERT INTO ${index}(${index}) VALUES('rebuild')`).run();
      rebuilt.push(index);
    }
  }
  return { checked: Object.keys(FTS_TABLES).length, rebuilt };
}
