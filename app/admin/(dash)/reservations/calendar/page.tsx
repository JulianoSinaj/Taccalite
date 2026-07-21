import Link from "next/link";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { getReservationsPage } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  table: "Tavolo",
  porchetta: "Porchetta",
  order: "Ordine",
};

// Little entry colouring per reservation status.
const STATUS_ENTRY: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-300",
  confirmed: "bg-emerald-100 text-emerald-900 border-emerald-300",
  completed: "bg-brown-900/10 text-brown-800 border-brown-900/20",
  cancelled: "bg-red-100 text-red-800 border-red-300 line-through opacity-70",
};

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** Today as yyyy-mm-dd using the server's local calendar components. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

type SP = { searchParams: Promise<{ start?: string }> };

export default async function ReservationCalendar({ searchParams }: SP) {
  const { start } = await searchParams;
  const valid = start && /^\d{4}-\d{2}-\d{2}$/.test(start);
  const weekStart = mondayOf(valid ? start! : todayISO());
  const weekEnd = isoAddDays(weekStart, 6);
  const today = todayISO();

  // Gather every reservation in the visible week — page through the 25-row
  // window until we've collected them all (capped for safety on busy weeks).
  const collected: Row[] = [];
  let capped = false;
  let page = 1;
  while (true) {
    const { rows, pageCount } = await getReservationsPage({ from: weekStart, to: weekEnd, page });
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
          <div className="flex items-center gap-2 print:hidden">
            <Link
              href="/admin/reservations"
              className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Elenco
            </Link>
            <Link
              href={`/admin/reservations/calendar?start=${prevStart}`}
              className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              ← Settimana
            </Link>
            <Link
              href="/admin/reservations/calendar"
              className="rounded-full bg-brown-950 px-4 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
            >
              Oggi
            </Link>
            <Link
              href={`/admin/reservations/calendar?start=${nextStart}`}
              className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Settimana →
            </Link>
          </div>
        }
      />

      {capped && (
        <p className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-800">
          Settimana molto piena: mostrate le prime {collected.length} prenotazioni.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {Array.from(byDay.entries()).map(([dayISO, items], i) => {
          const isToday = dayISO === today;
          return (
            <div
              key={dayISO}
              className={`flex break-inside-avoid flex-col rounded-2xl border bg-white p-3 shadow-sm ${
                isToday ? "border-gold ring-1 ring-gold" : "border-brown-900/10"
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between border-b border-brown-900/10 pb-1.5">
                <span className="text-[11px] font-bold tracking-widest text-brown-800/70 uppercase">
                  {WEEKDAYS[i]}
                </span>
                <span className={`font-display text-lg ${isToday ? "text-gold-deep" : "text-brown-950"}`}>
                  {fmtDayNum(dayISO)}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="py-2 text-center text-xs text-brown-800/40">—</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((r) => (
                    <li
                      key={r.id}
                      className={`rounded-lg border px-2 py-1.5 text-xs ${
                        STATUS_ENTRY[r.status] ?? "bg-brown-900/10 text-brown-800 border-brown-900/20"
                      }`}
                    >
                      <div className="flex items-center gap-1 font-semibold">
                        {r.time && <span className="tabular-nums">{r.time}</span>}
                        <span className="rounded bg-black/5 px-1 text-[9px] font-bold tracking-wider uppercase">
                          {TYPE_LABEL[r.type] ?? r.type}
                        </span>
                      </div>
                      <div className="truncate" title={r.name}>
                        {r.name}
                      </div>
                      {r.type === "porchetta" && r.quantityKg != null && (
                        <div className="font-semibold">{r.quantityKg} kg</div>
                      )}
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
