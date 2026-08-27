/**
 * The pure half of `lib/site-content.ts`: parsers with no database and no
 * `server-only`, so the admin editor can run them in the browser for a live
 * preview and a row count that matches exactly what the public page will do.
 */

/** One record parsed out of a `records` value. */
export type ContentRecord = Record<string, string>;

export type ContentTokens = { legalName: string; email: string };

/** `{legalName}` and `{email}` resolve to the site's own identity. */
export function applyTokensWith(raw: string, t: ContentTokens): string {
  return raw.replaceAll("{legalName}", t.legalName).replaceAll("{email}", t.email);
}

/** Non-empty lines. */
export function parseLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Pipe-separated records, one per line.
 *
 * A row with fewer fields than declared keeps the missing ones empty rather than
 * being dropped: a half-typed line should render as a half-filled card the owner
 * can see and finish, not vanish silently.
 */
export function parseRecords(raw: string, fields: string[]): ContentRecord[] {
  return parseLines(raw).map((line) => {
    const parts = line.split("|").map((p) => p.trim());
    const rec: ContentRecord = {};
    fields.forEach((f, i) => (rec[f] = parts[i] ?? ""));
    return rec;
  });
}

/** Paragraph blocks, split on blank lines (the shape `RichText` renders). */
export function parseBlocks(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Lines of a `records` value that would render as a half-filled card: fewer
 * fields than declared, or a declared field left empty. 1-based line numbers.
 */
export function incompleteRecordLines(raw: string, fields: string[]): number[] {
  const out: number[] = [];
  raw.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < fields.length || parts.slice(0, fields.length).some((p) => !p)) out.push(i + 1);
  });
  return out;
}

/** Markers a legal draft carries until somebody has actually reviewed it. */
export const DRAFT_MARKERS = ["DA VERIFICARE", "da rimuovere prima della pubblicazione"];

export function hasDraftMarkers(raw: string): boolean {
  return DRAFT_MARKERS.some((m) => raw.includes(m));
}
