import Link from "next/link";
import {
  AdminHeader,
  Panel,
  OrderStatusBadge,
  euro,
  inputCls,
  labelCls,
} from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { PrintButton } from "@/components/admin/PrintButton";
import {
  getFulfilmentDay,
  adminGetShops,
  adminGetDeliveryZones,
  type FulfilmentLine,
} from "@/lib/admin/queries";
import {
  handOverOrder,
  markOrderReady,
  settleOrderPayment,
} from "@/lib/admin/order-actions";
import { isAdmin } from "@/lib/auth/session";
import { shopScope } from "@/lib/admin/scope";
import { agendaRange, shiftIsoDate } from "@/lib/agenda-range";
import { getPickupSlots } from "@/lib/db/queries";
import { isoWeekday } from "@/lib/pickup-slots";
import { PAYMENT_INSTRUMENT_LABEL } from "@/lib/payments/methods";
import { instantInRome, dateInRome, BUSINESS_TZ } from "@/lib/time";
import type { OrderRow, PickupSlotRow } from "@/lib/db/schema";

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
 *
 * Each row carries the whole transaction the counter does with it: what goes in
 * the bag, how to reach the customer, what is still owed, and the two gestures
 * that close it — «pronto» (tell them) and «consegnato» (take the money, if any,
 * and hand it over). Everything that is a button is hidden in print.
 */

// ── Formatting ───────────────────────────────────────────────────────────────

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", {
    timeZone: BUSINESS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const clock = (d: Date) =>
  d.toLocaleTimeString("it-IT", {
    timeZone: BUSINESS_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });

/** "2× Ciauscolo · 1,2 kg Porchetta" — what goes in the bag, on one line. */
function formatLines(lines: FulfilmentLine[]): string {
  return lines
    .map((l) =>
      l.weightKg != null
        ? `${l.weightKg.toLocaleString("it-IT")} kg ${l.name}`
        : `${l.quantity}× ${l.name}`,
    )
    .join(" · ");
}

function formatAddress(addr: Record<string, string>): string {
  return `${addr.address ?? ""}, ${addr.zip ?? ""} ${addr.city ?? ""}`
    .replace(/^,\s*/, "")
    .trim();
}

const mapsHref = (addr: Record<string, string>) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatAddress(addr))}`;

/** What the sheet has to know about an order's state. */
function stateOf(order: OrderRow) {
  return {
    /** Still somebody's job: not handed over, not cancelled, not refunded. */
    open: order.status === "pending" || order.status === "paid",
    /** Money changes hands at handover. (An unpaid *card* checkout never reaches
     *  the sheet — see `getFulfilmentDay` — so "unpaid" here always means it.) */
    toCollect: order.paymentStatus === "unpaid" && order.status !== "cancelled",
  };
}

const chipCls =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase";
const chipIdle = `${chipCls} bg-brown-900/10 text-brown-950 hover:bg-brown-900/15`;
const chipOn = `${chipCls} bg-brown-950 text-cream`;
const rowLinkCls =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-3 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15";

// ── Pieces ───────────────────────────────────────────────────────────────────

/** Contanti or POS: the two ways money arrives at the counter or on the doorstep. */
function PaidWithSelect({ id }: { id: string }) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        Pagato con
      </label>
      <select
        id={id}
        name="paidWith"
        defaultValue="cash"
        className="min-h-11 rounded-lg border border-brown-900/15 bg-cream/40 px-2 text-xs text-brown-950 focus:border-gold-dark focus:outline-none"
      >
        <option value="cash">{PAYMENT_INSTRUMENT_LABEL.cash}</option>
        <option value="pos">{PAYMENT_INSTRUMENT_LABEL.pos}</option>
      </select>
    </>
  );
}

/**
 * One order, with everything the person holding the sheet needs and the one
 * or two actions that are the next step.
 */
function OrderLine({
  order,
  lines,
  shopName,
  detail,
  detailHref,
}: {
  order: OrderRow;
  lines: FulfilmentLine[];
  shopName?: string | null;
  /** Address for a delivery, carrier + tracking for a shipment. */
  detail?: string | null;
  /** Where `detail` opens (a map, the courier's tracking page). */
  detailHref?: string | null;
}) {
  const { open, toCollect } = stateOf(order);
  const shipping = order.fulfilment === "shipping";
  const delivery = order.fulfilment === "delivery";
  const readyLabel = delivery ? "In consegna" : "Pronto";

  return (
    <Panel className="py-3 sm:py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link
              href={`/admin/orders/${order.id}`}
              className="font-semibold text-brown-950 hover:underline print:no-underline"
            >
              {order.name}
            </Link>
            <span className="text-xs text-brown-800/70">
              {order.orderNumber}
            </span>
            {order.phone && (
              // A link, because this page is read on a phone by someone who is
              // about to call: "nobody answers the bell".
              <a
                href={`tel:${order.phone.replace(/[^\d+]/g, "")}`}
                className="text-sm text-brown-800/70 underline decoration-brown-800/30 underline-offset-2 hover:text-brown-950 print:no-underline"
              >
                {order.phone}
              </a>
            )}
            {shopName && (
              <span className="text-sm text-brown-800/70">· {shopName}</span>
            )}
            {detail &&
              (detailHref ? (
                <a
                  href={detailHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-brown-950 underline decoration-brown-800/30 underline-offset-2 hover:text-brown-800 print:no-underline"
                >
                  {detail}
                </a>
              ) : (
                <span className="text-sm text-brown-950">· {detail}</span>
              ))}
          </div>
          {/* Printed on purpose: this sheet is what the bag is packed from. */}
          {lines.length > 0 && (
            <p className="mt-1 text-sm text-brown-800/80">
              {formatLines(lines)}
            </p>
          )}
          {order.notes && (
            <p className="mt-1 text-sm text-brown-800/70">“{order.notes}”</p>
          )}
        </div>

        {/* `shrink-0`: the money and badges are short, and they must never
            squeeze the name and lines column into a one-word-per-line strip. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <span className="font-semibold text-brown-950 tabular-nums">
            {euro(order.totalCents)}
          </span>
          {/* The single most important thing on this sheet for an unpaid order:
              whoever hands the parcel over has to take money for it, and this is
              the page they are holding when they do. Printed too, deliberately. */}
          {toCollect && (
            <span className="border border-gold-dark/50 bg-gold/20 px-2 py-1 text-[11px] font-bold tracking-wider text-brown-950 uppercase">
              Da incassare {euro(order.totalCents)}
            </span>
          )}
          {order.readyAt && open && !shipping && (
            <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-bold tracking-widest text-ok-soft-fg uppercase">
              {readyLabel} · {clock(order.readyAt)}
            </span>
          )}
          {/* "In attesa" on a contrassegno says nothing "Da incassare" hasn't. */}
          {order.status !== "pending" && <OrderStatusBadge status={order.status} />}
        </div>
      </div>

      {/* The actions get a row of their own: a select and two buttons next to
          the totals left the name column a few characters wide. */}
      {(open || (order.status === "fulfilled" && toCollect)) && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-brown-900/10 pt-3 print:hidden">
          {open && !shipping && !order.readyAt && (
            <ActionForm action={markOrderReady} className="inline-flex">
              <input type="hidden" name="id" value={order.id} />
              <PendingButton tone="dark">
                {delivery ? "In consegna · avvisa" : "Pronto · avvisa"}
              </PendingButton>
            </ActionForm>
          )}
          {open && !shipping && (
            <ActionForm
              action={handOverOrder}
              className="inline-flex items-center gap-2"
            >
              <input type="hidden" name="id" value={order.id} />
              {toCollect && <PaidWithSelect id={`paid-with-${order.id}`} />}
              <PendingButton tone="gold">
                {toCollect ? "Incassa e consegna" : "✓ Consegnato"}
              </PendingButton>
            </ActionForm>
          )}
          {/* Goods first, money after — the bottega's rhythm — leaves an order
                that is evaso and still owed. The money is taken here too. */}
          {order.status === "fulfilled" && toCollect && (
            <ActionForm
              action={settleOrderPayment}
              className="inline-flex items-center gap-2"
            >
              <input type="hidden" name="id" value={order.id} />
              <PaidWithSelect id={`paid-with-${order.id}`} />
              <PendingButton tone="gold">Incassa</PendingButton>
            </ActionForm>
          )}
          {shipping && open && (
            <Link href={`/admin/orders/${order.id}`} className={rowLinkCls}>
              Tracking e spedizione
            </Link>
          )}
          <Link
            href={`/admin/orders/${order.id}/packing-slip`}
            className={rowLinkCls}
          >
            Bolla
          </Link>
        </div>
      )}
    </Panel>
  );
}

/**
 * A section header states the money as well as the count: the driver's float
 * and the counter's expected takings are read off it.
 */
function Section({
  title,
  orders,
  empty,
  children,
}: {
  title: string;
  orders: OrderRow[];
  empty: string;
  children?: React.ReactNode;
}) {
  const count = orders.length;
  const total = orders.reduce(
    (s, o) =>
      s + (stateOf(o).open || o.status === "fulfilled" ? o.totalCents : 0),
    0,
  );
  const due = orders.reduce(
    (s, o) => s + (stateOf(o).toCollect ? o.totalCents : 0),
    0,
  );
  return (
    <section className="break-inside-avoid">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-brown-900/10 pb-2">
        <h2 className="font-display text-xl text-brown-950">{title}</h2>
        <span className="text-xs font-bold tracking-widest text-brown-800/70 uppercase">
          {count} {count === 1 ? "ordine" : "ordini"}
          {count > 0 && ` · ${euro(total)}`}
          {due > 0 && (
            <span className="text-brown-950"> · da incassare {euro(due)}</span>
          )}
        </span>
      </div>
      {count === 0 ? (
        <p className="px-1 py-2 text-sm text-brown-800/70">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </section>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 mb-1.5 text-xs font-bold tracking-widest text-brown-800/70 uppercase">
      {children}
    </p>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type SP = {
  searchParams: Promise<{ giorno?: string; giorni?: string; negozio?: string }>;
};

type Window = { atMs: number; at: Date; items: OrderRow[] };
type Day = { date: string; windows: Window[] };

export default async function FulfilmentToday({ searchParams }: SP) {
  const sp = await searchParams;
  const shopFilter = sp.negozio ?? "all";
  // Resolved outside the render body, like every other date-scoped admin screen
  // (the React Compiler lint forbids `new Date()` here). One day by default; the
  // week view is for seeing how full the coming windows are.
  const range = agendaRange({
    giorno: sp.giorno,
    giorni: sp.giorni === "7" ? "7" : undefined,
  });
  const week = range.preset === "7";
  const from = range.from;
  const to = range.to ?? range.from;

  // The day is a Rome day, not a UTC one: a window at 08:00 on the 22nd must not
  // land in the 21st because the server runs in UTC.
  const fromMs = instantInRome(from, "00:00").getTime();
  const toMs = instantInRome(shiftIsoDate(to, 1), "00:00").getTime();

  // The shop chips below are a convenience; this is the boundary. Without it the
  // day sheet listed the other location's pickups — names, phone numbers and
  // totals — to an operator whose orders list refuses them.
  const scope = await shopScope();
  const [work, allShops, zones, slots, admin] = await Promise.all([
    getFulfilmentDay(fromMs, toMs, shopFilter, scope),
    adminGetShops(),
    adminGetDeliveryZones(),
    getPickupSlots(),
    isAdmin(),
  ]);
  // A scoped operator gets no chips for locations they cannot open.
  const shops = scope ? allShops.filter((s) => s.slug === scope) : allShops;
  const shopName = new Map(allShops.map((s) => [s.slug, s.name]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const singleShop = shopFilter !== "all" || shops.length === 1;

  // Pickups group by day (visible only in the week view), then by the window
  // they booked; the counter reads the sheet by time.
  const days: Day[] = [];
  for (const o of work.pickups) {
    if (!o.pickupSlotAt) continue;
    const date = dateInRome(o.pickupSlotAt);
    let day = days[days.length - 1];
    if (!day || day.date !== date) {
      day = { date, windows: [] };
      days.push(day);
    }
    const atMs = o.pickupSlotAt.getTime();
    let w = day.windows[day.windows.length - 1];
    if (!w || w.atMs !== atMs) {
      w = { atMs, at: o.pickupSlotAt, items: [] };
      day.windows.push(w);
    }
    w.items.push(o);
  }

  // The schedule row a window came from, for its end time and its capacity.
  // Matched by shop, weekday and start rather than by id, because the order
  // stores only the instant (see `orders.pickupSlotAt`); a window the schedule
  // no longer has is simply shown without them.
  const slotFor = (shop: string, at: Date): PickupSlotRow | undefined =>
    slots.find(
      (s) =>
        s.shopSlug === shop &&
        s.weekday === isoWeekday(dateInRome(at)) &&
        s.startTime === clock(at),
    );

  /** "10:00–12:30 — 4 ordini · 4/10", or per sede when more than one is in view. */
  const windowLabel = (w: Window): string => {
    const perShop = new Map<string, number>();
    for (const o of w.items)
      perShop.set(o.shopSlug ?? "", (perShop.get(o.shopSlug ?? "") ?? 0) + 1);
    const load: string[] = [];
    let end: string | null | undefined;
    for (const [shop, n] of perShop) {
      const slot = slotFor(shop, w.at);
      // Shown only when every sede in the window agrees on it.
      const slotEnd = slot?.endTime ?? null;
      end = end === undefined ? slotEnd : end === slotEnd ? end : null;
      if (!slot) continue;
      const cap =
        slot.capacityOrders == null ? "∞" : String(slot.capacityOrders);
      load.push(
        singleShop
          ? `${n}/${cap}`
          : `${shopName.get(shop) ?? shop} ${n}/${cap}`,
      );
    }
    const time = end ? `${clock(w.at)}–${end}` : clock(w.at);
    const n = w.items.length;
    return `${time} — ${n} ${n === 1 ? "ordine" : "ordini"}${load.length ? ` · ${load.join(" · ")}` : ""}`;
  };

  // Deliveries group by round, because that is how they are driven.
  const rounds = new Map<string, OrderRow[]>();
  for (const o of work.deliveries) {
    const key = o.deliveryZoneId ?? "";
    rounds.set(key, [...(rounds.get(key) ?? []), o]);
  }

  const total =
    work.pickups.length +
    work.unscheduled.length +
    work.deliveries.length +
    work.shipments.length;
  const linesOf = (o: OrderRow) => work.lines.get(o.id) ?? [];

  const link = (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({
      negozio: shopFilter,
      giorno: from,
      giorni: sp.giorni,
      ...params,
    })) {
      if (v && v !== "all") qs.set(k, v);
    }
    const s = qs.toString();
    return `/admin/fulfilment/oggi${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <AdminHeader
        title="Ritiri e consegne"
        subtitle={`${total}${work.truncated ? "+" : ""} ordini da gestire · ${range.label}`}
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {/* The zone/slot editor is admin-only and redirects everyone else,
                so staff were being offered a round trip back to the dashboard. */}
            {admin && (
              <Link href="/admin/fulfilment" className={chipIdle}>
                Configura
              </Link>
            )}
            <PrintButton />
          </div>
        }
      />

      {/* The three backlog queues are capped, and the section counts used to
          be the returned length — so a shop with more than a hundred parcels
          waiting was told it had exactly a hundred. */}
      {work.truncated && (
        <p className="mb-6 rounded-2xl border border-warn/40 bg-warn-soft px-5 py-3 text-sm text-warn-soft-fg">
          Sono in arretrato più ordini di quanti ne stia mostrando: qui sotto
          vedi i primi 100 per coda. Evadine una parte e ricarica per vedere i
          successivi.
        </p>
      )}

      <Panel className="mb-6 print:hidden">
        <div className="mb-3 flex flex-wrap gap-2">
          <Link
            href={link({ giorno: range.prev, giorni: undefined })}
            className={chipIdle}
          >
            ← Giorno prec.
          </Link>
          <Link
            href={link({ giorno: range.today, giorni: undefined })}
            className={range.preset === "oggi" ? chipOn : chipIdle}
          >
            Oggi
          </Link>
          <Link
            href={link({ giorno: range.next, giorni: undefined })}
            className={chipIdle}
          >
            Giorno succ. →
          </Link>
          <Link
            href={link({ giorno: undefined, giorni: "7" })}
            className={week ? chipOn : chipIdle}
          >
            Prossimi 7 giorni
          </Link>
        </div>

        <form
          action="/admin/fulfilment/oggi"
          method="get"
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label className={labelCls} htmlFor="ff-day">
              Giorno
            </label>
            <input
              id="ff-day"
              type="date"
              name="giorno"
              defaultValue={from}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="ff-shop">
              Sede
            </label>
            <select
              id="ff-shop"
              name="negozio"
              defaultValue={shopFilter}
              className={inputCls}
            >
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
            className={`${chipCls} bg-brown-950 px-5 py-2.5 text-cream hover:bg-brown-900`}
          >
            Mostra
          </button>
        </form>
      </Panel>

      <div className="space-y-8">
        <Section
          title={
            week ? "Ritiri · prossimi 7 giorni" : `Ritiri · ${formatDay(from)}`
          }
          orders={work.pickups}
          empty={
            week
              ? "Nessun ritiro prenotato nei prossimi 7 giorni."
              : "Nessun ritiro prenotato per questo giorno."
          }
        >
          {days.map((day) => (
            <div key={day.date}>
              {week && (
                <h3 className="mt-6 font-display text-lg text-brown-950 first:mt-0">
                  {formatDay(day.date)}
                </h3>
              )}
              {day.windows.map((w) => (
                <div key={w.atMs} className="break-inside-avoid">
                  <GroupHeading>{windowLabel(w)}</GroupHeading>
                  <div className="space-y-2">
                    {w.items.map((o) => (
                      <OrderLine
                        key={o.id}
                        order={o}
                        lines={linesOf(o)}
                        shopName={
                          singleShop ? null : shopName.get(o.shopSlug ?? "")
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </Section>

        {/* Orders placed before this location published any window, or by a
            counter operator who left it blank. They have no day of their own, so
            they would be invisible on a screen scoped to one — and they are
            still owed to somebody. */}
        <Section
          title="Ritiri senza orario"
          orders={work.unscheduled}
          empty="Nessuno: ogni ritiro da evadere ha una fascia."
        >
          {work.unscheduled.map((o) => (
            <OrderLine
              key={o.id}
              order={o}
              lines={linesOf(o)}
              shopName={singleShop ? null : shopName.get(o.shopSlug ?? "")}
            />
          ))}
        </Section>

        <Section
          title="Consegne a domicilio"
          orders={work.deliveries}
          empty="Nessuna consegna in attesa."
        >
          {[...rounds.entries()].map(([zoneId, items]) => {
            const zone = zoneById.get(zoneId);
            return (
              <div key={zoneId || "senza-zona"} className="break-inside-avoid">
                <GroupHeading>
                  {zone?.name ?? "Zona non assegnata"} — {items.length}
                  {/* The round's own rules, where the person driving it reads them. */}
                  {zone?.note ? ` · ${zone.note}` : ""}
                  {zone && zone.leadTimeHours > 0
                    ? ` · preavviso ${zone.leadTimeHours} h`
                    : ""}
                </GroupHeading>
                <div className="space-y-2">
                  {items.map((o) => (
                    <OrderLine
                      key={o.id}
                      order={o}
                      lines={linesOf(o)}
                      detail={
                        o.shippingAddress
                          ? formatAddress(o.shippingAddress)
                          : null
                      }
                      detailHref={
                        o.shippingAddress ? mapsHref(o.shippingAddress) : null
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </Section>

        <Section
          title="Spedizioni da preparare"
          orders={work.shipments}
          empty="Nessuna spedizione in attesa."
        >
          {work.shipments.map((o) => (
            <OrderLine
              key={o.id}
              order={o}
              lines={linesOf(o)}
              detail={
                o.trackingNumber
                  ? `${o.carrier ?? "Corriere"} ${o.trackingNumber}`
                  : "tracking da inserire"
              }
            />
          ))}
        </Section>
      </div>

      <p className="mt-8 text-xs text-brown-800/70 print:hidden">
        «Pronto» e «In consegna» avvisano il cliente via email senza chiudere
        l&apos;ordine. «Consegnato» — o «Incassa e consegna», per chi paga alla
        consegna — lo chiude senza inviare nulla: la merce è già nelle sue mani.
        Una spedizione si chiude dal dettaglio ordine, dove si inserisce il
        tracking che parte nell&apos;email al cliente.
      </p>
    </div>
  );
}
