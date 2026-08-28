import Link from "next/link";
import { AdminHeader, Panel, NewButton } from "@/components/admin/ui";
import { DeleteForm } from "@/components/admin/ActionForm";
import { adminGetShops, adminUpcomingClosures } from "@/lib/admin/queries";
import { isAdmin } from "@/lib/auth/session";
import { shopScope } from "@/lib/admin/scope";
import { deleteShop } from "@/lib/admin/actions";
import { dateInRome, timeInRome } from "@/lib/time";
import { openRangesOn, openStateAt, shopHoursRows } from "@/lib/hours";
import { closureRangeLabel, closureStatus, closureTimeLabel } from "@/lib/closures";
import type { ShopRow, ShopClosureRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function ServiceTag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-widest uppercase ${
        on ? "bg-ok-soft text-ok-soft-fg" : "bg-brown-900/10 text-brown-800/70"
      }`}
    >
      {label}
    </span>
  );
}

/** "09:00–13:00, 16:00–20:00" from minute ranges. */
function rangesLabel(ranges: { start: number; end: number }[]): string {
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return ranges.map((r) => `${hhmm(r.start)}–${hhmm(r.end)}`).join(", ");
}

const linkCls =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15";

/**
 * What the public site would be missing for this sede. Each one is silent on
 * the site itself — a blank line, a hidden badge — so this is the only place
 * an operator finds out.
 */
function shopWarnings(shop: ShopRow, todayRanges: { start: number; end: number }[] | null): string[] {
  const out: string[] = [];
  if (!shop.address) out.push("Indirizzo mancante: la sede non compare sulla mappa.");
  if (!shop.phone) out.push("Telefono mancante: il sito non mostra un numero da chiamare.");
  const rows = shopHoursRows(shop);
  if (rows.length === 0) {
    out.push("Orari mancanti: sul sito non compare nessun orario e i tavoli si prenotano a qualsiasi ora.");
  } else if (todayRanges == null && !(shop.hoursStructured && shop.hoursStructured.length > 0)) {
    out.push("Orari liberi non leggibili: attiva gli orari strutturati per il badge «aperto adesso».");
  }
  if (rows.length > 0 && !shop.hoursConfirmed) {
    out.push("Orari da confermare: il sito nasconde il badge «aperto adesso».");
  }
  if (!shop.image) out.push("Immagine mancante: la pagina della sede usa uno spazio vuoto.");
  return out;
}

/** The closure that affects a sede first: the one under way, else the next. */
function nextClosureFor(closures: ShopClosureRow[], slug: string): ShopClosureRow | null {
  return closures.find((c) => c.shopSlug == null || c.shopSlug === slug) ?? null;
}

export default async function AdminShops() {
  const today = dateInRome();
  const [all, closures, admin, scope] = await Promise.all([
    adminGetShops(),
    adminUpcomingClosures(today),
    isAdmin(),
    shopScope(),
  ]);
  const now = timeInRome(new Date());
  // Only the sede the operator works at — the editor now refuses the others, so
  // listing them would only offer a link to a `notFound()`.
  const shops = scope ? all.filter((s) => s.slug === scope) : all;

  return (
    <div>
      <AdminHeader
        title="Negozi"
        subtitle={`${shops.length} ${shops.length === 1 ? "sede" : "sedi"} · dati, orari, servizi`}
        action={admin ? <NewButton href="/admin/shops/new">+ Nuova sede</NewButton> : undefined}
      />

      {shops.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessuna sede ancora. Aggiungine una con «Nuova sede».</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {shops.map((s) => {
            const todayRanges = openRangesOn(s, today);
            const state = s.hoursConfirmed ? openStateAt(s, today, now) : null;
            const warnings = shopWarnings(s, todayRanges);
            const closure = nextClosureFor(closures, s.slug);
            return (
              <Panel key={s.id} className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-1 gap-4">
                  {s.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- simple admin thumbnail
                    <img
                      src={s.image}
                      alt=""
                      className="hidden size-20 shrink-0 rounded-lg object-cover ring-1 ring-brown-900/10 sm:block"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg text-brown-950">
                      {s.name}{" "}
                      <span className="text-xs font-normal text-brown-800/70">
                        /{s.slug} · ordine {s.sortOrder}
                      </span>
                    </p>
                    {s.specialty && <p className="text-xs text-brown-800/70">{s.specialty}</p>}
                    <p className="mt-1 text-xs text-brown-800/70">
                      {[s.address, s.phone, s.email].filter(Boolean).join(" · ") || "Nessun contatto inserito"}
                    </p>

                    {/* Today, in words: what a customer on /sedi sees right now. */}
                    <p className="mt-2 text-sm text-brown-900">
                      {state ? (
                        <span
                          className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase ${
                            state.open ? "bg-ok-soft text-ok-soft-fg" : "bg-brown-900/10 text-brown-800/70"
                          }`}
                        >
                          {state.open ? "Aperto adesso" : "Chiuso adesso"}
                        </span>
                      ) : null}
                      {todayRanges == null
                        ? "Oggi: orari non disponibili"
                        : todayRanges.length === 0
                          ? "Oggi: chiuso"
                          : `Oggi: ${rangesLabel(todayRanges)}`}
                      {state?.nextChange && (
                        <span className="text-brown-800/70">
                          {" "}
                          · {state.open ? "chiude" : "apre"} alle {state.nextChange}
                        </span>
                      )}
                    </p>

                    {closure && (
                      <p className="mt-1 text-xs font-medium text-warn-soft-fg">
                        {closureStatus(closure, today) === "ongoing" ? "Chiusura in corso" : "Prossima chiusura"}{" "}
                        {closureRangeLabel(closure)}
                        {closureTimeLabel(closure) ? ` ${closureTimeLabel(closure)}` : ""}
                        {closure.shopSlug == null ? " (tutte le sedi)" : ""}
                        {closure.reason ? ` · ${closure.reason}` : ""}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <ServiceTag on={s.reservationsEnabled} label="Prenotazioni" />
                      <ServiceTag on={s.storeEnabled} label="Store" />
                      <ServiceTag on={s.porchettaEnabled} label="Porchetta" />
                    </div>
                    <p className="mt-2 text-xs text-brown-800/70">
                      Porchetta:{" "}
                      {s.porchettaCapacityKg != null ? `${s.porchettaCapacityKg} kg/giorno` : "capacità generale"} ·
                      Coperti per fascia: {s.seatsCapacity != null ? s.seatsCapacity : "nessun limite"}
                    </p>

                    {warnings.length > 0 && (
                      <ul className="mt-3 space-y-1 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn-soft-fg">
                        {warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Link href={`/admin/shops/${s.id}`} className={linkCls}>
                    Modifica
                  </Link>
                  <Link href={`/sedi/${s.slug}`} target="_blank" rel="noopener" className={linkCls}>
                    Vedi sul sito
                  </Link>
                  {/* Closures are admin-only, like creating and removing a sede. */}
                  {admin && (
                    <Link href={`/admin/chiusure?negozio=${encodeURIComponent(s.slug)}`} className={linkCls}>
                      Chiusure
                    </Link>
                  )}
                  {/* Staff may edit a sede they work in; removing one is a full
                      admin's call, and `deleteShop` enforces that server-side. */}
                  {admin && (
                    <DeleteForm
                      action={deleteShop}
                      id={s.id}
                      confirm={`Eliminare la sede "${s.name}"? Possibile solo se nessun prodotto, ordine, prenotazione o utente è collegato.`}
                    />
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
