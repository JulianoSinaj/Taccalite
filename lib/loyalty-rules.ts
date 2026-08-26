/**
 * The one accrual rule, shared by the server (the credit itself) and the
 * counter screen (the preview), so the two can never disagree.
 *
 * Points = floor(euros × rate). A rate of 0 or unset counts as 1, as the order
 * accrual already treats it. The rounding step first kills floating-point
 * noise: 0.29 × 100 is 28.999999999999996 in JS, and a bare floor would owe the
 * customer a point.
 */
export function pointsForEuros(euros: number, pointsPerEuro: number | null | undefined): number {
  if (!Number.isFinite(euros) || euros <= 0) return 0;
  const raw = euros * (pointsPerEuro || 1);
  return Math.floor(Math.round(raw * 1e6) / 1e6);
}
