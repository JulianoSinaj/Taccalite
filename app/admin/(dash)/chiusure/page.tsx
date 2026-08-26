import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { ClosureForm } from "@/components/admin/ClosureForm";
import { ClosureCard } from "@/components/admin/ClosureCard";
import { ClosureHolidays } from "@/components/admin/ClosureHolidays";
import { adminGetClosures, adminGetPastClosures, adminGetShops } from "@/lib/admin/queries";
import { closureStatus, isWholeDay } from "@/lib/closures";
import { italianHolidays } from "@/lib/holidays";
import { isAdmin } from "@/lib/auth/session";
import { dateInRome } from "@/lib/time";
import type { ShopClosureRow } from "@/lib/db/schema";

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
 * The page is three things in order of how often they are needed: add one
 * closure; add a year's holidays in one go; see what is coming, with what is
 * already booked inside it — because declaring a closure deliberately cancels
 * nothing, and the shop has to know who to ring. History unfolds on request.
 */

const BTN =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15";

type SP = { searchParams: Promise<{ negozio?: string; passate?: string; anno?: string }> };

export default async function AdminClosures({ searchParams }: SP) {
  // Closures gate the public booking form for every location, so they are a
  // full admin's call rather than a per-shop one.
  if (!(await isAdmin())) redirect("/admin");

  const params = await searchParams;
  const today = dateInRome();
  const showPast = params.passate === "1";
  // The checklist covers this year or next; anything else is a typo in the URL.
  const thisYear = Number(today.slice(0, 4));
  const year = Number(params.anno) === thisYear + 1 ? thisYear + 1 : thisYear;

  const [all, shops, allPast] = await Promise.all([
    adminGetClosures(today),
    adminGetShops(),
    showPast ? adminGetPastClosures(today) : Promise.resolve([] as ShopClosureRow[]),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));

  // `?negozio=` (linked from Negozi) narrows the list to what affects one sede:
  // its own closures plus the ones declared for every location.
  const negozio = params.negozio && shopName.has(params.negozio) ? params.negozio : undefined;
  const forShop = <T extends ShopClosureRow>(rows: T[]) =>
    negozio ? rows.filter((c) => c.shopSlug == null || c.shopSlug === negozio) : rows;
  const closures = forShop(all);
  const past = forShop(allPast);
  const self = (extra: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ negozio, anno: params.anno, passate: params.passate, ...extra })) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return `/admin/chiusure${s ? `?${s}` : ""}`;
  };

  const ongoing = closures.filter((c) => closureStatus(c, today) === "ongoing").length;
  const toRing = closures.filter((c) => c.toNotify > 0).length;

  // A holiday counts as covered when any whole-day closure spans it, whatever
  // the scope — the checklist is for the days nobody has thought about yet.
  const covered = new Set(
    italianHolidays(year)
      .filter((h) => all.some((c) => isWholeDay(c) && h.date >= c.fromDate && h.date <= c.toDate))
      .map((h) => h.date),
  );

  const subtitle =
    closures.length === 0
      ? "Nessuna chiusura programmata — tutti i giorni sono prenotabili"
      : [
          ongoing > 0 ? `${ongoing} in corso` : null,
          `${closures.length - ongoing} ${closures.length - ongoing === 1 ? "programmata" : "programmate"}`,
          toRing > 0 ? `${toRing} con clienti da avvisare` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div>
      <AdminHeader
        title="Chiusure"
        subtitle={subtitle}
        action={
          <Link href={self({ passate: showPast ? undefined : "1" })} className={BTN}>
            {showPast ? "Nascondi storico" : "Storico"}
          </Link>
        }
      />

      {negozio && (
        <p className="mb-4 text-sm text-brown-800/70">
          Stai vedendo le chiusure di <strong>{shopName.get(negozio)}</strong> (e quelle valide per
          tutte le sedi).{" "}
          <Link href={self({ negozio: undefined })} className="font-semibold text-gold-deep underline">
            Mostra tutte
          </Link>
        </p>
      )}

      <Panel className="mb-6">
        <h2 className="font-display mb-1 text-lg text-brown-950">Nuova chiusura</h2>
        <p className="mb-4 text-sm text-brown-800/70">
          Il sito smette di accettare prenotazioni e di offrire fasce di ritiro in queste date. Le
          prenotazioni già prese <strong>non</strong> vengono annullate — le trovi elencate qui sotto,
          così puoi avvisare i clienti.
        </p>
        <ClosureForm shops={shops} today={today} defaultShop={negozio} />
      </Panel>

      <ClosureHolidays
        year={year}
        today={today}
        shops={shops}
        covered={covered}
        defaultShop={negozio}
        yearHref={(y) => self({ anno: y === thisYear ? undefined : String(y) })}
      />

      <h2 className="font-display mt-8 mb-3 text-xl text-brown-950">In corso e programmate</h2>

      {closures.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            Nessuna chiusura. Aggiungi le ferie e le festività prima che qualcuno prenoti per un
            giorno in cui la bottega è chiusa.
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {closures.map((c) => (
            <ClosureCard key={c.id} closure={c} shops={shops} shopName={shopName} today={today} />
          ))}
        </div>
      )}

      {showPast && (
        <>
          <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Passate</h2>
          {past.length === 0 ? (
            <Panel>
              <p className="text-brown-800/70">Nessuna chiusura passata.</p>
            </Panel>
          ) : (
            <div className="space-y-3">
              {past.map((c) => (
                <ClosureCard key={c.id} closure={c} shops={shops} shopName={shopName} today={today} />
              ))}
            </div>
          )}
        </>
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
