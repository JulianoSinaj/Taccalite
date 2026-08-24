import "server-only";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionError } from "@/lib/admin/action-state";

/**
 * Which location the signed-in operator may act on.
 *
 * Two shops shared one undivided gestionale: the navigation hid a few admin-only
 * destinations from staff, but a counter person at Carni could open Centro's
 * orders list, refund Centro's orders, edit Centro's products and read Centro's
 * customers. The shop filter was a convenience pre-selection, never a boundary.
 *
 * `users.shopSlug` makes it one. The rule is deliberately narrow:
 *
 *  - **null means every location.** Admins are always null, and so is every
 *    account on an install that never assigns a shop — which is every existing
 *    account, so nothing changes until someone opts in.
 *  - The scope is applied in three places, because a filter alone is not access
 *    control: `lockShop` forces the list query, `assertShopScope` refuses the
 *    detail pages, and `requireShopScope` refuses the mutating actions. Missing
 *    any one of the three leaves the data reachable by typing a URL.
 *
 * Rows with **no shop at all** (a courier shipment, a global discount) stay
 * visible to everyone: they belong to the business, not to a counter.
 */

/** The shop the viewer is confined to, or null for the whole business. */
export async function shopScope(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "admin") return null;
  return user.shopSlug ?? null;
}

/**
 * Force a list filter onto the viewer's shop.
 *
 * Returns what the `negozio` facet must be. A scoped operator cannot widen it by
 * editing the query string, and cannot narrow it to somebody else's shop either
 * — the answer does not depend on what they asked for.
 */
export function lockShop(requested: string | undefined, scope: string | null): string | undefined {
  return scope ?? requested;
}

/**
 * Shop facet options for a viewer.
 *
 * A scoped operator was offered a chip per location and a "Tutte le sedi" —
 * none of which their list would honour, since `lockShop` had already decided
 * the answer. Clicking one moved the highlight and changed nothing. Give them
 * the one option that is true instead.
 */
export function shopChips(
  shops: { slug: string; name: string }[],
  scope: string | null,
): { value: string; label: string }[] {
  const each = shops
    .filter((s) => !scope || s.slug === scope)
    .map((s) => ({ value: s.slug, label: s.name }));
  return scope ? each : [{ value: "all", label: "Tutte le sedi" }, ...each];
}

/** True when a row belonging to `rowShopSlug` is inside `scope`. */
export function inScope(rowShopSlug: string | null | undefined, scope: string | null): boolean {
  if (!scope) return true;
  // A row with no location belongs to the business as a whole.
  if (!rowShopSlug) return true;
  return rowShopSlug === scope;
}

/**
 * Refuse a detail page for another location's row.
 *
 * `notFound()` rather than a message: "this exists but is not yours" is itself
 * information, and the operator has no legitimate way to have arrived here.
 */
export async function assertShopScope(rowShopSlug: string | null | undefined): Promise<void> {
  const scope = await shopScope();
  if (!inScope(rowShopSlug, scope)) notFound();
}

/** Refuse a mutating action on another location's row, with a sentence. */
export async function requireShopScope(rowShopSlug: string | null | undefined): Promise<void> {
  const scope = await shopScope();
  if (!inScope(rowShopSlug, scope)) {
    throw new ActionError("Questo record appartiene a un'altra sede: non puoi modificarlo.");
  }
}
