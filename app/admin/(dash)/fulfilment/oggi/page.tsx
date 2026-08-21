import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, euro, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { PrintButton } from "@/components/admin/PrintButton";
import { getFulfilmentDay, adminGetShops, adminGetDeliveryZones } from "@/lib/admin/queries";
import { updateOrderStatus } from "@/lib/admin/order-actions";
import { isAdmin } from "@/lib/auth/session";
import { agendaRange } from "@/lib/agenda-range";
import { instantInRome, BUSINESS_TZ } from "@/lib/time";
import { FULFILMENT_LABEL } from "@/lib/fulfilment";
import type { OrderRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * The morning screen: what has to physically leave the shop today.
 *
 * Reservations have had `/admin/reservations/agenda` since the beginning — one
 * printable sheet the counter works from. Orders had nothing equivalent. The
 * closest thing was `/admin/orders?tipo=pickup&stato=to-fulfil`, a list sorted by
 * when the order was placed, with no notion of *when the customer is coming* and
 * no way to print just today's.
 *
 * The four sections are scoped differently on purpose, because the work is:
 * a pickup is an appointment and belongs to its day, while deliveries and
 * shipments are queues that must be emptied whenever they were placed — showing
 * only today's would hide yesterday's unshipped order, the one that matters most.
 */

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", {
    timeZone: BUSINESS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const clock = (d: Date) =>
  d.toLocaleTimeString("it-IT", { timeZone: BUSINESS_TZ, hour: "2-digit", minute: "2-digit" });

type SP = { searchParams: Promise<{ giorno?: string; negozio?: string }> };

/** One order line, with the single action that is almost always the next step. */
function OrderLine({
  order,
  shopName,
  detail,
}: {
  order: OrderRow;
  shopName?: string | null;
  detail?: string | null;
}) {
  return (
    <Panel className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href={`/admin/orders/${order.id}`}
          className="font-semibold text-brown-950 hover:underline print:no-underline"
        >
          {order.name}
        </Link>
        <span className="text-xs text-brown-800/60">{order.orderNumber}</span>
        {order.phone && <span className="text-sm text-brown-800/70">· {order.phone}</span>}
        {shopName && <span className="text-sm text-brown-800/60">· {shopName}</span>}
        {detail && <span className="text-sm text-brown-950">· {detail}</span>}
        {order.notes && (
          <span className="w-full text-sm text-brown-800/70 sm:w-auto">“{order.notes}”</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-brown-950 tabular-nums">{euro(order.totalCents)}</span>
        <StatusBadge status={order.status} />
        {order.status === "paid" && (
          <ActionForm action={updateOrderStatus} className="inline-flex print:hidden">
            <input type="hidden" name="id" value={order.id} />
            <input type="hidden" name="status" value="fulfilled" />
            <input type="hidden" name="paymentStatus" value={order.paymentStatus} />
            <PendingButton tone="gold">✓ Consegnato</PendingButton>
          </ActionForm>
        )}
      </div>
    </Panel>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-brown-900/10 pb-2">
        <h2 className="font-display text-xl text-brown-950">{title}</h2>
        <span className="text-xs font-bold tracking-widest text-brown-800/60 uppercase">
          {count} {count === 1 ? "ordine" : "ordini"}
        </span>
      </div>
      {count === 0 ? (
        <p className="px-1 py-2 text-sm text-brown-800/60">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

export default async function FulfilmentToday({ searchParams }: SP) {
  const sp = await searchParams;
  const shopFilter = sp.negozio ?? "all";
  // Resolved outside the render body, like every other date-scoped admin screen
  // (the React Compiler lint forbids `new Date()` here).
  const range = agendaRange({ giorno: sp.giorno });
  const day = range.from;

  // The day is a Rome day, not a UTC one: a window at 08:00 on the 22nd must not
  // land in the 21st because the server runs in UTC.
  const fromMs = instantInRome(day, "00:00").getTime();
  const toMs = instantInRome(range.next, "00:00").getTime();

  const [work, shops, zones, admin] = await Promise.all([
    getFulfilmentDay(fromMs, toMs, shopFilter),
    adminGetShops(),
    adminGetDeliveryZones(),
    isAdmin(),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));

  // Pickups group by the window they booked; the counter reads the sheet by time.
  const windows: { atMs: number; label: string; items: OrderRow[] }[] = [];
  for (const o of work.pickups) {
    if (!o.pickupSlotAt) continue;
    const atMs = o.pickupSlotAt.getTime();
    let g = windows[windows.length - 1];
    if (!g || g.atMs !== atMs) {
      g = { atMs, label: clock(o.pickupSlotAt), items: [] };
      windows.push(g);
    }
    g.items.push(o);
  }

  // Deliveries group by round, because that is how they are driven.
  const rounds = new Map<string, OrderRow[]>();
  for (const o of work.deliveries) {
    const key = o.deliveryZoneId ?? "";
    rounds.set(key, [...(rounds.get(key) ?? []), o]);
  }

  const total =
    work.pickups.length + work.unscheduled.length + work.deliveries.length + work.shipments.length;

  const link = (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ negozio: shopFilter, giorno: day, ...params })) {
      if (v && v !== "all") qs.set(k, v);
    }
    const s = qs.toString();
    return `/admin/fulfilment/oggi${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <AdminHeader
        title="Ritiri e consegne"
        subtitle={`${total} ordini da gestire · ${formatDay(day)}`}
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {/* The zone/slot editor is admin-only and redirects everyone else,
                so staff were being offered a round trip back to the dashboard. */}
            {admin && (
              <Link
                href="/admin/fulfilment"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
              >
                Configura
              </Link>
            )}
            <PrintButton />
          </div>
        }
      />

      <Panel className="mb-6 print:hidden">
        <div className="mb-3 flex flex-wrap gap-2">
          <Link
            href={link({ giorno: range.prev })}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            ← Giorno prec.
          </Link>
          <Link
            href={link({ giorno: range.today })}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              range.preset === "oggi"
                ? "bg-brown-950 text-cream"
                : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            Oggi
          </Link>
          <Link
            href={link({ giorno: range.next })}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Giorno succ. →
          </Link>
        </div>

        <form action="/admin/fulfilment/oggi" method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls} htmlFor="ff-day">
              Giorno
            </label>
            <input id="ff-day" type="date" name="giorno" defaultValue={day} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="ff-shop">
              Sede
            </label>
            <select id="ff-shop" name="negozio" defaultValue={shopFilter} className={inputCls}>
              <option value="all">Tutte le sedi</option>
              {shops.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
          >
            Mostra
          </button>
        </form>
      </Panel>

      <div className="space-y-8">
        <Section
          title={`Ritiri · ${formatDay(day)}`}
          count={work.pickups.length}
          empty="Nessun ritiro prenotato per questo giorno."
        >
          {windows.map((w) => (
            <div key={w.atMs} className="break-inside-avoid">
              <p className="mt-4 mb-1.5 text-xs font-bold tracking-widest text-brown-800/60 uppercase">
                {w.label} — {w.items.length} {w.items.length === 1 ? "ordine" : "ordini"}
              </p>
              <div className="space-y-2">
                {w.items.map((o) => (
                  <OrderLine key={o.id} order={o} shopName={shopName.get(o.shopSlug ?? "")} />
                ))}
              </div>
            </div>
          ))}
        </Section>

        {/* Orders placed before this location published any window, or by a
            counter operator who left it blank. They have no day of their own, so
            they would be invisible on a screen scoped to one — and they are
            still owed to somebody. */}
        <Section
          title="Ritiri senza orario"
          count={work.unscheduled.length}
          empty="Nessuno: ogni ritiro da evadere ha una fascia."
        >
          {work.unscheduled.map((o) => (
            <OrderLine key={o.id} order={o} shopName={shopName.get(o.shopSlug ?? "")} />
          ))}
        </Section>

        <Section
          title="Consegne a domicilio"
          count={work.deliveries.length}
          empty="Nessuna consegna in attesa."
        >
          {[...rounds.entries()].map(([zoneId, items]) => (
            <div key={zoneId || "senza-zona"} className="break-inside-avoid">
              <p className="mt-4 mb-1.5 text-xs font-bold tracking-widest text-brown-800/60 uppercase">
                {zoneName.get(zoneId) ?? "Zona non assegnata"} — {items.length}
              </p>
              <div className="space-y-2">
                {items.map((o) => (
                  <OrderLine
                    key={o.id}
                    order={o}
                    detail={
                      o.shippingAddress
                        ? `${o.shippingAddress.address ?? ""}, ${o.shippingAddress.zip ?? ""} ${o.shippingAddress.city ?? ""}`.trim()
                        : null
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section
          title="Spedizioni da preparare"
          count={work.shipments.length}
          empty="Nessuna spedizione in attesa."
        >
          {work.shipments.map((o) => (
            <OrderLine
              key={o.id}
              order={o}
              detail={
                o.trackingNumber
                  ? `${o.carrier ?? "Corriere"} ${o.trackingNumber}`
                  : "tracking da inserire"
              }
            />
          ))}
        </Section>
      </div>

      <p className="mt-8 text-xs text-brown-800/50 print:hidden">
        {FULFILMENT_LABEL.pickup} e {FULFILMENT_LABEL.delivery.toLowerCase()} si chiudono con
        «Consegnato»; una spedizione conviene chiuderla dal dettaglio ordine, dove si inserisce il
        tracking che parte nell&apos;email al cliente.
      </p>
    </div>
  );
}
