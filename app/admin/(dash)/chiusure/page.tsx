import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { adminGetClosures, adminGetShops } from "@/lib/admin/queries";
import { saveClosure, deleteClosure } from "@/lib/admin/fulfilment-actions";
import { isAdmin } from "@/lib/auth/session";
import { dateInRome } from "@/lib/time";
import type { ShopRow } from "@/lib/db/schema";
import type { ClosureWithBookings } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

/**
 * Days the shop is shut.
 *
 * Everything else that decided whether a day was bookable was weekly — the
 * structured opening hours name the open weekdays, the pickup schedule recurs by
 * weekday — so the calendar had no representation at all. Ferragosto and Boxing
 * Day were bookable, and the only lever was the global "prenotazioni attive"
 * switch, which also closes the days either side of the one you meant.
 *
 * The list leads with what is *already booked* inside each range, because
 * declaring a closure deliberately cancels nothing: a shop marking August in
 * June must not silently drop the bookings it has already promised. The number
 * is the difference between "that day is closed now" and "that day is closed
 * now and here are the four people to ring".
 */

/** "26 luglio 2026" — the ISO date is already local, so no timezone conversion. */
function fmtDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Whole days a range covers, inclusive of both ends. */
function dayCount(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/** The create/edit form. Same fields either way — a new closure is one with no id. */
function ClosureForm({ closure, shops, today }: { closure?: ClosureWithBookings; shops: ShopRow[]; today: string }) {
  return (
    <ActionForm action={saveClosure} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {closure && <input type="hidden" name="id" value={closure.id} />}

      <div>
        <label className={labelCls} htmlFor={`from-${closure?.id ?? "new"}`}>
          Dal
        </label>
        <input
          id={`from-${closure?.id ?? "new"}`}
          type="date"
          name="fromDate"
          required
          defaultValue={closure?.fromDate ?? today}
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor={`to-${closure?.id ?? "new"}`}>
          Al (compreso)
        </label>
        <input
          id={`to-${closure?.id ?? "new"}`}
          type="date"
          name="toDate"
          defaultValue={closure && closure.toDate !== closure.fromDate ? closure.toDate : ""}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brown-800/60">Lascia vuoto per un solo giorno.</p>
      </div>

      <div>
        <label className={labelCls} htmlFor={`shop-${closure?.id ?? "new"}`}>
          Sede
        </label>
        <select
          id={`shop-${closure?.id ?? "new"}`}
          name="shopSlug"
          defaultValue={closure?.shopSlug ?? ""}
          className={inputCls}
        >
          <option value="">Tutte le sedi</option>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor={`reason-${closure?.id ?? "new"}`}>
          Motivo
        </label>
        <input
          id={`reason-${closure?.id ?? "new"}`}
          name="reason"
          maxLength={200}
          defaultValue={closure?.reason ?? ""}
          placeholder="es. Ferie estive, Ferragosto, lavori"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brown-800/60">
          Mostrato al cliente quando la data viene rifiutata.
        </p>
      </div>

      <div className="sm:col-span-2">
        <p className={labelCls}>Cosa si ferma</p>
        {/* Two flags rather than one because the cases genuinely differ: a
            kitchen refit stops table bookings while the counter still hands over
            orders already paid for, and a van off the road is the reverse. */}
        <div className="flex flex-wrap gap-5">
          <label className="inline-flex items-center gap-2 text-sm text-brown-900">
            <input type="hidden" name="blocksReservations" value="false" />
            <input
              type="checkbox"
              name="blocksReservations"
              value="true"
              defaultChecked={closure?.blocksReservations ?? true}
              className="h-5 w-5 rounded accent-brown-950"
            />
            Prenotazioni (tavolo, porchetta, ordini speciali)
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-brown-900">
            <input type="hidden" name="blocksPickup" value="false" />
            <input
              type="checkbox"
              name="blocksPickup"
              value="true"
              defaultChecked={closure?.blocksPickup ?? true}
              className="h-5 w-5 rounded accent-brown-950"
            />
            Ritiri e consegne
          </label>
        </div>
      </div>

      <div className="sm:col-span-2">
        <PendingButton>{closure ? "Salva chiusura" : "Aggiungi chiusura"}</PendingButton>
      </div>
    </ActionForm>
  );
}

export default async function AdminClosures() {
  // Closures gate the public booking form for every location, so they are a
  // full admin's call rather than a per-shop one.
  if (!(await isAdmin())) redirect("/admin");

  const today = dateInRome();
  const [closures, shops] = await Promise.all([adminGetClosures(today), adminGetShops()]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));

  return (
    <div>
      <AdminHeader
        title="Chiusure"
        subtitle={
          closures.length === 0
            ? "Nessuna chiusura programmata — tutti i giorni sono prenotabili"
            : `${closures.length} chiusure da oggi in poi`
        }
      />

      <Panel className="mb-6">
        <h2 className="font-display mb-1 text-lg text-brown-950">Nuova chiusura</h2>
        <p className="mb-4 text-sm text-brown-800/70">
          Il sito smette di accettare prenotazioni e di offrire fasce di ritiro in queste date. Le
          prenotazioni già prese <strong>non</strong> vengono annullate — le trovi elencate qui
          sotto, così puoi avvisare i clienti.
        </p>
        <ClosureForm shops={shops} today={today} />
      </Panel>

      <h2 className="font-display mt-8 mb-3 text-xl text-brown-950">Programmate</h2>

      {closures.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            Nessuna chiusura. Aggiungi le ferie e le festività prima che qualcuno prenoti per un
            giorno in cui la bottega è chiusa.
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {closures.map((c) => {
            const days = dayCount(c.fromDate, c.toDate);
            const booked = c.reservationCount + c.pickupCount;
            return (
              <Panel key={c.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg text-brown-950">
                      {c.fromDate === c.toDate
                        ? fmtDay(c.fromDate)
                        : `${fmtDay(c.fromDate)} — ${fmtDay(c.toDate)}`}
                      {days > 1 && (
                        <span className="ml-2 text-xs font-normal text-brown-800/50">
                          {days} giorni
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-brown-800/60">
                      {c.shopSlug ? (shopName.get(c.shopSlug) ?? c.shopSlug) : "Tutte le sedi"}
                      {c.reason ? ` · ${c.reason}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.blocksReservations && (
                        <span className="rounded-full bg-brown-900/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-brown-800 uppercase">
                          Prenotazioni sospese
                        </span>
                      )}
                      {c.blocksPickup && (
                        <span className="rounded-full bg-brown-900/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-brown-800 uppercase">
                          Ritiri sospesi
                        </span>
                      )}
                    </div>

                    {/* The whole reason this page counts anything. A closure
                        added after bookings were taken is the normal case, and
                        the shop has to know who to call. */}
                    {booked > 0 && (
                      <div className="mt-3 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn-soft-fg">
                        In queste date risultano già{" "}
                        {c.reservationCount > 0 && (
                          <Link
                            href={`/admin/reservations?da=${c.fromDate}&a=${c.toDate}`}
                            className="font-bold underline"
                          >
                            {c.reservationCount === 1
                              ? "1 prenotazione"
                              : `${c.reservationCount} prenotazioni`}
                          </Link>
                        )}
                        {c.reservationCount > 0 && c.pickupCount > 0 ? " e " : ""}
                        {c.pickupCount > 0 && (
                          <Link
                            href={`/admin/fulfilment/oggi?giorno=${c.fromDate}`}
                            className="font-bold underline"
                          >
                            {c.pickupCount === 1 ? "1 ritiro" : `${c.pickupCount} ritiri`}
                          </Link>
                        )}
                        . Non sono state annullate: avvisa i clienti prima.
                      </div>
                    )}
                  </div>

                  <div className="shrink-0">
                    <DeleteForm
                      action={deleteClosure}
                      id={c.id}
                      confirm={`Rimuovere la chiusura ${
                        c.fromDate === c.toDate ? `del ${c.fromDate}` : `dal ${c.fromDate} al ${c.toDate}`
                      }? Le date tornano prenotabili.`}
                    >
                      Rimuovi
                    </DeleteForm>
                  </div>
                </div>

                <details className="mt-4 border-t border-brown-900/10 pt-3">
                  <summary className="w-fit cursor-pointer text-[11px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
                    Modifica
                  </summary>
                  <div className="mt-4">
                    <ClosureForm closure={c} shops={shops} today={today} />
                  </div>
                </details>
              </Panel>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-brown-800/60">
        Gli orari settimanali si impostano in{" "}
        <Link href="/admin/shops" className="font-semibold text-gold-deep underline">
          Negozi
        </Link>
        ; le fasce di ritiro in{" "}
        <Link href="/admin/fulfilment" className="font-semibold text-gold-deep underline">
          Zone e fasce
        </Link>
        . Qui vanno solo le eccezioni a calendario.
      </p>
    </div>
  );
}
