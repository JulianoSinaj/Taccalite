/** Formatting helpers usable from both server and client components. */

export function formatEuro(cents: number): string {
  return `€ ${(cents / 100).toFixed(2)}`;
}
