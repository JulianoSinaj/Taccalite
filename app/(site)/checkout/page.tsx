import type { Metadata } from "next";
import {
  getShops,
  getSetting,
  getDeliveryZones,
  getPickupSlots,
  getPickupSlotCounts,
  getClosures,
} from "@/lib/db/queries";
import { pickupSlotOptions } from "@/lib/pickup-slots";
import { getCurrentUser } from "@/lib/auth/session";
import CheckoutClient from "@/components/store/CheckoutClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

/** `annullato=1` is where Stripe returns a customer who backed out of payment. */
type SP = { searchParams: Promise<{ annullato?: string }> };

export default async function CheckoutPage({ searchParams }: SP) {
  const { annullato } = await searchParams;
  const [shops, user, pointsPerEuro, loyaltyEnabled, zones, slots, booked, closures] =
    await Promise.all([
      getShops(),
      getCurrentUser(),
      getSetting<number>("loyalty.pointsPerEuro", 1),
      getSetting<boolean>("loyalty.enabled", true),
      getDeliveryZones(),
      getPickupSlots(),
      getPickupSlotCounts(),
      getClosures(),
    ]);
  // Only shops with the store enabled can take pickup orders.
  const pickupShops = shops.filter((s) => s.storeEnabled).map((s) => ({ slug: s.slug, name: s.name }));
  const open = new Set(pickupShops.map((s) => s.slug));

  // Windows are resolved here, not in the browser: which ones are still open
  // depends on the cut-off and on how many orders already hold each one, and
  // neither is the client's to decide. `createOrder` re-derives them anyway.
  const slotOptions = pickupSlotOptions(
    slots.filter((s) => open.has(s.shopSlug)),
    // Closures are days the shop is shut; the weekly schedule cannot express
    // them, so without this a window is offered on the Thursday of the August
    // shutdown and refused only after the customer has reached Stripe.
    { bookedCounts: booked, days: 14, closures },
  ).map((o) => ({ value: o.value, shopSlug: o.shopSlug, label: o.label, remaining: o.remaining }));

  // Zones are shipped whole so the browser can quote carriage with the very same
  // function the server charges with — `createOrder` recomputes from these rows
  // regardless, so nothing here is trusted. Delivery areas and their prices are
  // public information; `createdAt` is dropped because it is nobody's business.
  const zoneProps = zones.map((z) => ({
    id: z.id,
    name: z.name,
    mode: z.mode,
    postcodes: z.postcodes,
    shopSlug: z.shopSlug,
    feeCents: z.feeCents,
    freeOverCents: z.freeOverCents,
    minOrderCents: z.minOrderCents,
    perKgCents: z.perKgCents,
    leadTimeHours: z.leadTimeHours,
    note: z.note,
    sortOrder: z.sortOrder,
    active: z.active,
  }));

  return (
    <CheckoutClient
      shops={pickupShops}
      pointsPerEuro={pointsPerEuro}
      loyaltyEnabled={loyaltyEnabled}
      zones={zoneProps}
      slotOptions={slotOptions}
      user={user ? { name: user.name, email: user.email, phone: user.phone } : null}
      cancelled={annullato === "1"}
    />
  );
}
