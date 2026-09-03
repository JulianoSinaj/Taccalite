import Link from "next/link";
import { AdminHeader, Panel, reservationTypeLabel } from "@/components/admin/ui";
import { getReservationsPage, adminGetShops } from "@/lib/admin/queries";
import { getClosures } from "@/lib/db/queries";
import { closureTimeLabel, isWholeDay } from "@/lib/closures";
import { shopScope, lockShop } from "@/lib/admin/scope";
import { dateInRome } from "@/lib/time";

export const dynamic = "force-dynamic";

// Little entry colouring per reservation status. Mirrors `STATUS_STYLES` in
// `components/admin/ui.tsx` — including the ring that keeps `no_show` apart from
// `pending` now that both map to `warn`. Without its own entry `no_show` fell
// through to the neutral grey and read as "completata".
const STATUS_ENTRY: Record<string, string> = {
  pending: "bg-warn-soft text-warn-soft-fg border-warn/40",
  confirmed: "bg-ok-soft text-ok-soft-fg border-ok/40",
  completed: "bg-brown-900/10 text-brown-800 border-brown-900/20",
  cancelled: "bg-danger-soft text-danger-soft-fg border-danger/40 line-through opacity-70",
  no_show: "bg-warn-soft text-warn-soft-fg border-warn/40 ring-1 ring-warn/50",
};

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** Add `n` days to a yyyy-mm-dd string via UTC math (DST-safe). */
function isoAddDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Weekday index with Monday = 0 … Sunday = 6. */
function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function mondayOf(iso: string): string {
  return isoAddDays(iso, -isoWeekday(iso));
}

function fmtDayNum(iso: string): string {
  const [, , d] = iso.split("-");
  return String(Number(d));
}

function fmtRange(fromISO: string, toISO: string): string {
  const f = new Date(`${fromISO}T00:00:00`);
  const t = new Date(`${toISO}T00:00:00`);
  const day = (x: Date) => x.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  return `${f.toLocaleDateString("it-IT", { day: "numeric", month: "long" })} – ${day(t)}`;
}

type Row = Awaited<ReturnType<typeof getReservationsPage>>["rows"][number];

const MAX_PAGES = 20; // safety cap: up to 500 reservations for one week

type SP = { searchParams: Promise<{ start?: string; negozio?: string }> };

export default async function ReservationCalendar({ searchParams }: SP) {
  const { start, negozio } = await searchParams;
  // Every other reservation surface locks the shop facet; the week grid did not,
  // so it showed both locations to an operator confined to one.
  const scope = await shopScope();
  const shopFilter = lockShop(negozio, scope);
  const valid = start && /^\d{4}-\d{2}-\d{2}$/.test(start);
  // The shop's own calendar day, like every other date-scoped admin screen. Read
  // off the server's clock (UTC in the container) the grid opened on last week
  // between midnight and 02:00 on a Monday, and ringed the wrong day the rest of
  // the week.
  const today = dateInRome();
  const weekStart = mondayOf(valid ? start! : today);
  const weekEnd = isoAddDays(weekStart, 6);

  // The week grid is where a closed day is most likely to be booked over by
  // hand, so it says which days are shut. Every location's closures show in
  // the all-shops view, each labelled with its shop.
  const [closures, shops] = await Promise.all([getClosures(weekStart), adminGetShops()]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));
  const allShops = !shopFilter || shopFilter === "all";
  const closedOn = (dayISO: string) =>
    closures.filter(
      (c) =>
        c.blocksReservations &&
        dayISO >= c.fromDate &&
        dayISO <= c.toDate &&
        (allShops || c.shopSlug == null || c.shopSlug === shopFilter),
    );

  // Gather every reservation in the visible week — page through the 25-row
  // window until we've collected them all (capped for safety on busy weeks).
  const collected: Row[] = [];
  let capped = false;
  let page = 1;
  while (true) {
    const { rows, pageCount } = await getReservationsPage({
      da: weekStart,
      a: weekEnd,
      negozio: shopFilter,
      page,
    });
    collected.push(...rows);
    if (page >= pageCount) break;
    if (page >= MAX_PAGES) {
      capped = true;
      break;
    }
    page += 1;
  }

  // Bucket by day, then order within each day by time (untimed entries last).
  const byDay = new Map<string, Row[]>();
  for (let i = 0; i < 7; i++) byDay.set(isoAddDays(weekStart, i), []);
  for (const r of collected) byDay.get(r.date)?.push(r);
  for (const items of byDay.values()) {
    items.sort((x, y) => (x.time ?? "99:99").localeCompare(y.time ?? "99:99"));
  }

  const prevStart = isoAddDays(weekStart, -7);
  const nextStart = isoAddDays(weekStart, 7);

  return (
    <div>
      <AdminHeader
        title="Calendario prenotazioni"
        subtitle={fmtRange(weekStart, weekEnd)}
        action={
          // `flex-wrap`, like every other header action in the gestionale.
          // Without it the four pills came to 448px on a 390px phone and
          // "Settimana →" — the way *forward* through the calendar — ran off the
          // right edge, where the shell's `overflow-x-clip` cut it in half with
          // nothing to scroll.
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Link
              href="/admin/reservations"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Elenco
            </Link>
            <Link
              href={`/admin/reservations/calendar?start=${prevStart}`}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              ← Settimana
            </Link>
            <Link
              href="/admin/reservations/calendar"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-4 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
            >
              Oggi
            </Link>
            <Link
              href={`/admin/reservations/calendar?start=${nextStart}`}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Settimana →
            </Link>
          </div>
        }
      />

      {capped && (
        <p className="mb-4 rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn-soft-fg">
          Settimana molto piena: mostrate le prime {collected.length} prenotazioni.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {Array.from(byDay.entries()).map(([dayISO, items], i) => {
          const isToday = dayISO === today;
          const closed = closedOn(dayISO);
          const shutAllDay = closed.some(isWholeDay);
          return (
            <div
              key={dayISO}
              className={`flex break-inside-avoid flex-col rounded-2xl border bg-surface p-3 shadow-sm ${
                isToday ? "border-gold ring-1 ring-gold" : shutAllDay ? "border-danger/40" : "border-brown-900/10"
              }`}
            >
              {/* The header opens that day's prep sheet — the calendar answers
                  "how does the week look", the agenda answers "what do I make
                  today", and one is the natural next click from the other. */}
              <Link
                href={`/admin/reservations/agenda?giorno=${dayISO}`}
                className="mb-2 flex items-baseline justify-between rounded-lg border-b border-brown-900/10 pb-1.5 hover:bg-brown-900/5"
                title={`Agenda del ${fmtDayNum(dayISO)}`}
              >
                <span className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
                  {WEEKDAYS[i]}
                </span>
                <span className={`font-display text-lg ${isToday ? "text-gold-deep" : "text-brown-950"}`}>
                  {fmtDayNum(dayISO)}
                </span>
              </Link>
              {closed.map((c) => (
                <p
                  key={`${c.id}`}
                  className="mb-1.5 rounded-md border border-danger/30 bg-danger-soft px-2 py-1 text-[11px] font-semibold text-danger-soft-fg"
                >
                  Chiuso{isWholeDay(c) ? "" : ` ${closureTimeLabel(c)}`}
                  {c.shopSlug ? ` · ${shopName.get(c.shopSlug) ?? c.shopSlug}` : ""}
                  {c.reason ? ` — ${c.reason}` : ""}
                </p>
              ))}
              {items.length === 0 ? (
                <Link
                  href={`/admin/reservations/new?data=${dayISO}`}
                  className="rounded-lg py-2 text-center text-xs text-brown-800/70 hover:bg-brown-900/5 hover:text-brown-800/70 print:hidden"
                >
                  + Nuova
                </Link>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((r) => (
                    <li key={r.id}>
                      {/* Every other list in the gestionale opens its detail page;
                          this one used to be the exception, so the week view was
                          somewhere you could read a booking but never act on it. */}
                      <Link
                        href={`/admin/reservations/${r.id}`}
                        className={`block rounded-lg border px-2 py-1.5 text-xs transition-shadow hover:shadow-md ${
                          STATUS_ENTRY[r.status] ?? "bg-brown-900/10 text-brown-800 border-brown-900/20"
                        }`}
                      >
                        <div className="flex items-center gap-1 font-semibold">
                          {r.time && <span className="tabular-nums">{r.time}</span>}
                          <span className="rounded bg-black/5 px-1 text-[10px] font-bold tracking-wider uppercase">
                            {reservationTypeLabel(r.type)}
                          </span>
                        </div>
                        <div className="truncate" title={r.name}>
                          {r.name}
                        </div>
                        {r.type === "porchetta" && r.quantityKg != null && (
                          <div className="font-semibold">{r.quantityKg} kg</div>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {collected.length === 0 && (
        <Panel className="mt-4">
          <p className="text-brown-800/70">Nessuna prenotazione in questa settimana.</p>
        </Panel>
      )}
    </div>
  );
}
