import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, reservationTypeLabel, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getUpcomingReservations, adminGetShops } from "@/lib/admin/queries";
import { porchettaCapacityFor } from "@/lib/reservations";
import { markPorchettaReady } from "@/lib/admin/reservation-actions";
import { PrintButton } from "@/components/admin/PrintButton";
import { agendaRange } from "@/lib/agenda-range";
import { shopScope } from "@/lib/admin/scope";

export const dynamic = "force-dynamic";

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

type Row = Awaited<ReturnType<typeof getUpcomingReservations>>[number];

type SP = {
  searchParams: Promise<{ giorno?: string; giorni?: string; negozio?: string }>;
};

export default async function ReservationAgenda({ searchParams }: SP) {
  const sp = await searchParams;
  const shopFilter = sp.negozio ?? "all";
  // Window resolution lives outside the component (no `new Date()` in render).
  const range = agendaRange({ giorno: sp.giorno, giorni: sp.giorni });

  // The day sheet answers "what do I prepare today" — for the location the
  // operator actually works at. It used to answer it for both.
  const scope = await shopScope();
  const [rows, allShops] = await Promise.all([
    getUpcomingReservations({ from: range.from, to: range.to, shopSlug: shopFilter, scope }),
    adminGetShops(),
  ]);
  const shops = scope ? allShops.filter((s) => s.slug === scope) : allShops;
  const shopName = new Map(allShops.map((s) => [s.slug, s.name]));

  // Capacity is per location, so the badge needs one figure per shop, not one
  // shared number compared against a mixed total.
  const capacities = new Map<string, number>();
  for (const s of shops) capacities.set(s.slug, await porchettaCapacityFor(s.slug));
  // Seats are a plain column on the shop; 0/null means no limit configured.
  const seatsByShop = new Map(shops.map((s) => [s.slug, s.seatsCapacity ?? 0]));

  // Rows arrive ordered by date then time — collapse into consecutive day groups.
  const groups: { date: string; items: Row[] }[] = [];
  for (const r of rows) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== r.date) {
      g = { date: r.date, items: [] };
      groups.push(g);
    }
    g.items.push(r);
  }

  const link = (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ negozio: shopFilter, ...params })) {
      if (v && v !== "all") qs.set(k, v);
    }
    const s = qs.toString();
    return `/admin/reservations/agenda${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <AdminHeader
        title="Agenda & preparazione"
        subtitle={`${rows.length} prenotazioni · ${range.label}`}
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Link
              href="/admin/reservations"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Elenco
            </Link>
            <PrintButton />
          </div>
        }
      />

      {/* Day navigation + shop filter. The sheet used to show every upcoming
          booking forever, with no way to print just tomorrow's. */}
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
              range.preset === "oggi" ? "bg-brown-950 text-cream" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
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
          <span className="mx-1 w-px self-stretch bg-brown-900/10" />
          <Link
            href={link({ giorni: "7" })}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              range.preset === "7" ? "bg-brown-950 text-cream" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            Prossimi 7 giorni
          </Link>
          <Link
            href={link({ giorni: "tutto" })}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              range.preset === "tutto" ? "bg-brown-950 text-cream" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            Tutto
          </Link>
        </div>

        <form action="/admin/reservations/agenda" method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls} htmlFor="agenda-day">
              Giorno
            </label>
            <input id="agenda-day" type="date" name="giorno" defaultValue={range.from} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="agenda-shop">
              Sede
            </label>
            <select id="agenda-shop" name="negozio" defaultValue={shopFilter} className={inputCls}>
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

      {groups.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessuna prenotazione in questo periodo.</p>
        </Panel>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            const porchetta = g.items.filter((r) => r.type === "porchetta");
            // Per shop, because each roasts its own — a combined total compared
            // against one cap was wrong for both locations.
            const kgByShop = new Map<string, number>();
            for (const r of porchetta) {
              kgByShop.set(r.shopSlug, (kgByShop.get(r.shopSlug) ?? 0) + (r.quantityKg ?? 0));
            }

            // Seats per (shop, time). The kilos of porchetta have been totalled
            // here since the sheet existed and the room never was — so a slot
            // that had been overbooked from the counter, where the check only
            // warns, showed nothing at all and the first signal was the door.
            const seatsBySlot = new Map<string, number>();
            for (const r of g.items) {
              if (r.type !== "table" || !r.time || r.status === "cancelled") continue;
              const key = `${r.shopSlug}|${r.time}`;
              seatsBySlot.set(key, (seatsBySlot.get(key) ?? 0) + (r.guests ?? 0));
            }
            const overbooked = [...seatsBySlot.entries()]
              .map(([key, guests]) => {
                const [slug, time] = key.split("|");
                return { slug, time, guests, capacity: seatsByShop.get(slug) ?? 0 };
              })
              .filter((s) => s.capacity > 0 && s.guests > s.capacity)
              .sort((a, b) => a.time.localeCompare(b.time));

            return (
              <section key={g.date} className="break-inside-avoid">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-brown-900/10 pb-2">
                  <h2 className="font-display text-xl text-brown-950 capitalize">{formatDay(g.date)}</h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold tracking-widest text-brown-800/70 uppercase">
                    <span>{g.items.length} prenotazioni</span>
                    {overbooked.map((s) => (
                      <span
                        key={`${s.slug}-${s.time}`}
                        className="rounded-full bg-danger-solid/15 px-3 py-1 text-danger-soft-fg"
                      >
                        {shopName.get(s.slug) ?? s.slug} {s.time}: {s.guests} / {s.capacity} coperti
                      </span>
                    ))}
                    {[...kgByShop.entries()].map(([slug, kg]) => {
                      const cap = capacities.get(slug) ?? 0;
                      const over = cap > 0 && kg > cap;
                      return (
                        <span
                          key={slug}
                          className={`rounded-full px-3 py-1 ${
                            over ? "bg-danger-solid/15 text-danger-soft-fg" : "bg-gold/30 text-brown-950"
                          }`}
                        >
                          {shopName.get(slug) ?? slug}: {kg}
                          {cap > 0 ? ` / ${cap}` : ""} kg{over ? " · oltre capacità" : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  {g.items.map((r) => (
                    <Panel key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="rounded-full bg-brown-900/10 px-2.5 py-0.5 text-[11px] font-bold tracking-widest uppercase">
                          {reservationTypeLabel(r.type)}
                        </span>
                        <Link
                          href={`/admin/reservations/${r.id}`}
                          className="font-semibold text-brown-950 hover:underline print:no-underline"
                        >
                          {r.name}
                        </Link>
                        <span className="text-sm text-brown-800/70">{r.phone}</span>
                        {r.time && <span className="text-sm text-brown-800/70">· {r.time}</span>}
                        {r.guests != null && <span className="text-sm text-brown-800/70">· {r.guests} p.</span>}
                        {r.tableNumber && (
                          <span className="text-sm font-semibold text-brown-950">· tav. {r.tableNumber}</span>
                        )}
                        {r.quantityKg != null && (
                          <span className="text-sm font-semibold text-brown-950">· {r.quantityKg} kg</span>
                        )}
                        <span className="text-sm text-brown-800/70">· {shopName.get(r.shopSlug) ?? r.shopSlug}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.type === "porchetta" &&
                          (r.readyAt ? (
                            <span className="rounded-full bg-ok-soft px-3 py-1 text-xs font-bold text-ok">
                              Inviata ✓
                            </span>
                          ) : r.email ? (
                            <ActionForm action={markPorchettaReady} className="print:hidden">
                              <input type="hidden" name="id" value={r.id} />
                              <PendingButton tone="gold">Segna pronta</PendingButton>
                            </ActionForm>
                          ) : (
                            // No address to send the notice to, so the button
                            // could only ever throw. Say why instead.
                            <span
                              className="rounded-full bg-brown-900/10 px-3 py-1 text-xs font-medium text-brown-800/70 print:hidden"
                              title="L'avviso di ritiro si invia via email"
                            >
                              Nessuna email
                            </span>
                          ))}
                        <StatusBadge status={r.status} />
                      </div>
                    </Panel>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
