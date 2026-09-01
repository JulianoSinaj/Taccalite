import Link from "next/link";
import { AdminHeader, Panel, euro, inputCls, labelCls } from "@/components/admin/ui";
import { PrintButton } from "@/components/admin/PrintButton";
import { getCashUp, adminGetShops } from "@/lib/admin/queries";
import { shopScope, lockShop } from "@/lib/admin/scope";
import { agendaRange } from "@/lib/agenda-range";
import { instantInRome, BUSINESS_TZ } from "@/lib/time";
import { PAYMENT_INSTRUMENT_LABEL, type PaymentInstrument } from "@/lib/payments/methods";

export const dynamic = "force-dynamic";

const BASE = "/admin/reports/cassa";

/**
 * Chiusura di cassa — what was taken today, split by how it arrived.
 *
 * `orders.paidWith` was recorded on every settlement and aggregated nowhere, so
 * the only figure the shop had at closing time was one undifferentiated
 * "Incasso oggi" — a number you cannot count a drawer against. This is the sheet
 * somebody stands at the till with, so it prints.
 *
 * Cash first, deliberately: it is the only line anybody physically counts.
 */
const ORDER: (PaymentInstrument | null)[] = ["cash", "pos", "card", "transfer", "other", null];

function instrumentLabel(i: string | null): string {
  if (!i) return "Non registrato";
  return PAYMENT_INSTRUMENT_LABEL[i as PaymentInstrument] ?? i;
}

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", {
    timeZone: BUSINESS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type SP = { searchParams: Promise<{ giorno?: string; negozio?: string }> };

export default async function CashUp({ searchParams }: SP) {
  const sp = await searchParams;
  const scope = await shopScope();
  const shopFilter = lockShop(sp.negozio, scope) ?? "all";

  // Resolved outside the render body, like every other date-scoped admin screen
  // (the React Compiler lint forbids `new Date()` here).
  const range = agendaRange({ giorno: sp.giorno });
  const day = range.from;
  // A Rome day, not a UTC one — a sale at 00:30 must land on the day the shop
  // thinks it did.
  const fromMs = instantInRome(day, "00:00").getTime();
  const toMs = instantInRome(range.next, "00:00").getTime();

  const [cash, allShops] = await Promise.all([
    getCashUp(fromMs, toMs, shopFilter, scope),
    adminGetShops(),
  ]);
  const shops = scope ? allShops.filter((s) => s.slug === scope) : allShops;

  const rows = [...cash.rows].sort(
    (a, b) => ORDER.indexOf(a.instrument as PaymentInstrument) - ORDER.indexOf(b.instrument as PaymentInstrument),
  );
  const netCents = cash.takenCents - cash.refundedCents;
  const counted = rows.find((r) => r.instrument === "cash");

  const link = (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ negozio: shopFilter, giorno: day, ...params })) {
      if (v && v !== "all") qs.set(k, v);
    }
    const s = qs.toString();
    return `${BASE}${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <AdminHeader
        title="Chiusura di cassa"
        subtitle={formatDay(day)}
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Link
              href={link({ giorno: range.prev })}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              ← Giorno
            </Link>
            <Link
              href={link({ giorno: undefined })}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-4 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
            >
              Oggi
            </Link>
            <Link
              href={link({ giorno: range.next })}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Giorno →
            </Link>
            <PrintButton>Stampa</PrintButton>
          </div>
        }
      />

      {/* The arrows above walk a day at a time, which is right for "yesterday"
          and useless for "last Saturday" — reconciling a till from a fortnight
          ago was a dozen clicks. The agenda has had this picker since the start;
          the two day-scoped screens that hadn't now agree with it. */}
      <form action={BASE} method="get" className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
        {shopFilter !== "all" && <input type="hidden" name="negozio" value={shopFilter} />}
        <div>
          <label className={labelCls} htmlFor="cassa-day">
            Giorno
          </label>
          <input id="cassa-day" type="date" name="giorno" defaultValue={day} className={inputCls} />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
        >
          Vai
        </button>
      </form>

      {shops.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2 print:hidden">
          <Link
            href={link({ negozio: "all" })}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              shopFilter === "all"
                ? "bg-brown-950 text-cream"
                : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            Tutte le sedi
          </Link>
          {shops.map((s) => (
            <Link
              key={s.slug}
              href={link({ negozio: s.slug })}
              className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
                shopFilter === s.slug
                  ? "bg-brown-950 text-cream"
                  : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
              }`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun incasso registrato in questa giornata.</p>
        </Panel>
      ) : (
        <div className="space-y-6">
          {/* The line anybody actually counts, first and on its own. */}
          {counted && (
            <Panel className="border-gold/40 bg-gold/5">
              <p className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
                Contanti attesi in cassa
              </p>
              <p className="font-display mt-1 text-3xl font-bold tabular-nums text-brown-950">
                {euro(counted.takenCents - counted.refundedCents)}
              </p>
              <p className="mt-1 text-xs text-brown-800/70">
                {counted.orders} {counted.orders === 1 ? "incasso" : "incassi"} in contanti
                {counted.refundedCents > 0 &&
                  `, al netto di ${euro(counted.refundedCents)} restituiti`}
                . Confronta con il fondo cassa contato a fine giornata.
              </p>
            </Panel>
          )}

          <Panel>
            <div className="scroll-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brown-900/10 text-left text-[12px] tracking-widest text-brown-800/70 uppercase">
                    <th scope="col" className="pb-2 font-bold">Strumento</th>
                    <th scope="col" className="pb-2 text-right font-bold">Ordini</th>
                    <th scope="col" className="pb-2 text-right font-bold">Incassato</th>
                    <th scope="col" className="pb-2 text-right font-bold">Restituito</th>
                    <th scope="col" className="pb-2 text-right font-bold">Netto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brown-900/10">
                  {rows.map((r) => (
                    <tr key={r.instrument ?? "none"}>
                      <td className="py-2 font-semibold text-brown-950">
                        {instrumentLabel(r.instrument)}
                        {r.instrument === null && (
                          <span className="ml-2 text-xs font-normal text-brown-800/70">
                            (incassi precedenti al tracciamento dello strumento)
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-brown-800/80">{r.orders}</td>
                      <td className="py-2 text-right tabular-nums text-brown-900">
                        {euro(r.takenCents)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-danger">
                        {r.refundedCents > 0 ? `−${euro(r.refundedCents)}` : "—"}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums text-brown-950">
                        {euro(r.takenCents - r.refundedCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-display border-t-2 border-brown-900/15 text-brown-950">
                    <td className="pt-3 font-bold">Totale</td>
                    <td className="pt-3 text-right font-bold tabular-nums">{cash.orders}</td>
                    <td className="pt-3 text-right font-bold tabular-nums">
                      {euro(cash.takenCents)}
                    </td>
                    <td className="pt-3 text-right font-bold tabular-nums">
                      {cash.refundedCents > 0 ? `−${euro(cash.refundedCents)}` : "—"}
                    </td>
                    <td className="pt-3 text-right font-bold tabular-nums">{euro(netCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-xs text-brown-800/70">
              Gli incassi sono contati sulla data in cui il denaro è arrivato, i rimborsi su quella
              in cui è stato restituito — le stesse regole del{" "}
              <Link href="/admin/reports/iva" className="font-semibold text-gold-deep underline">
                riepilogo IVA
              </Link>
              , così i due documenti si riconciliano.
            </p>
            {/* The one place the numbers on this page legitimately disagree with
                another screen. Both rules are deliberate — a till sheet has to
                show the money that moved that day, a management figure has to
                show what a sale was ultimately worth — but an operator who finds
                the gap without being told assumes one of the two is broken. */}
            <p className="mt-2 text-xs text-brown-800/70">
              La{" "}
              <Link href="/admin" className="font-semibold text-gold-deep underline">
                dashboard
              </Link>{" "}
              segue invece una regola gestionale: scala il rimborso dal giorno della{" "}
              <em>vendita</em>. Se un ordine è stato incassato in un periodo e rimborsato in quello
              dopo, le due cifre non coincidono — di preciso l&apos;importo restituito. È voluto:
              qui conta il denaro che si muove oggi in cassa.
            </p>
          </Panel>

          <p className="text-xs text-brown-800/70 print:hidden">
            <Link
              href={`/admin/orders?stato=incassati&data=incasso&da=${day}&a=${day}${
                shopFilter !== "all" ? `&negozio=${shopFilter}` : ""
              }`}
              className="font-bold tracking-widest text-gold-deep uppercase hover:underline"
            >
              Vedi i {cash.orders} ordini di questa giornata →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
