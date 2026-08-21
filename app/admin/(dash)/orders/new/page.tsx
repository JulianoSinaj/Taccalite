import { AdminHeader, BackLink } from "@/components/admin/ui";
import { ManualOrderForm } from "@/components/admin/ManualOrderForm";
import { adminGetProducts, adminGetShops } from "@/lib/admin/queries";
import { getDeliveryZones, getPickupSlots, getPickupSlotCounts } from "@/lib/db/queries";
import { pickupSlotOptions } from "@/lib/pickup-slots";
import { adminGetReservation } from "@/lib/admin/queries";
import { assertShopScope } from "@/lib/admin/scope";
import type { BookingPrefill } from "@/components/admin/ManualOrderForm";

export const dynamic = "force-dynamic";

/** `?prenotazione=<id>` arrives from "Converti in ordine" on a booking. */
type SP = { searchParams: Promise<{ prenotazione?: string }> };

export default async function NewManualOrder({ searchParams }: SP) {
  const { prenotazione } = await searchParams;
  const [products, shops, zones, slots, booked] = await Promise.all([
    adminGetProducts(),
    adminGetShops(),
    getDeliveryZones(),
    getPickupSlots(),
    getPickupSlotCounts(),
  ]);

  // The counter prices from the same zones the storefront does, so a phone order
  // and a web order to the same street cost the same.
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
  const slotOptions = pickupSlotOptions(slots, { bookedCounts: booked, days: 14 }).map((o) => ({
    value: o.value,
    shopSlug: o.shopSlug,
    label: o.label,
  }));

  // The booking's own fields become the starting values. Silently ignored when
  // the id is unknown or is not an "ordine speciale" — this is a convenience
  // link, and a wrong one should land on an ordinary empty form rather than an
  // error page.
  let booking: BookingPrefill | null = null;
  if (prenotazione) {
    const row = await adminGetReservation(prenotazione);
    const r = row?.reservation;
    if (r && r.type === "order") {
      await assertShopScope(r.shopSlug);
      booking = {
        id: r.id,
        reference: r.reference,
        name: r.name,
        phone: r.phone,
        email: r.email ?? "",
        shopSlug: r.shopSlug,
        date: r.date,
        notes: r.notes ?? "",
      };
    }
  }

  return (
    <div>
      <BackLink href={booking ? `/admin/reservations/${booking.id}` : "/admin/orders"}>
        {booking ? "Prenotazione" : "Ordini"}
      </BackLink>
      <AdminHeader
        title={booking ? "Converti in ordine" : "Nuovo ordine"}
        subtitle={
          booking
            ? `Prenotazione ${booking.reference} · ${booking.name}`
            : "Registra una vendita al banco o telefonica"
        }
      />
      <ManualOrderForm
        products={products}
        shops={shops}
        pricing={{ zones: zoneProps, slotOptions }}
        booking={booking}
      />
    </div>
  );
}
