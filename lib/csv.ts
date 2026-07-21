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
