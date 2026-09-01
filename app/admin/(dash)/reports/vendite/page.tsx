import Link from "next/link";
import { AdminHeader, Panel, euro, inputCls, labelCls } from "@/components/admin/ui";
import { SegmentedFilter } from "@/components/admin/FilterBar";
import { PrintButton } from "@/components/admin/PrintButton";
import { getSalesAnalysis, adminGetShops } from "@/lib/admin/queries";
import { shopScope, lockShop, shopChips } from "@/lib/admin/scope";
import { vatPeriod, VAT_PRESETS, type VatPresetKey } from "@/lib/fiscal-period";
import { marginPct, type SalesGroup } from "@/lib/sales-analysis";

export const dynamic = "force-dynamic";

const BASE = "/admin/reports/vendite";

type SP = {
  searchParams: Promise<{ da?: string; a?: string; periodo?: string; negozio?: string }>;
};

/** Kilos to one decimal, pieces whole — a line is one or the other. */
function units(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
}

function pctDelta(cur: number, prev: number): { pct: number; up: boolean } | null {
  if (prev <= 0) return cur > 0 ? { pct: 100, up: true } : null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { pct: Math.abs(pct), up: pct >= 0 };
}

function Delta({ d }: { d: { pct: number; up: boolean } | null }) {
  if (!d) return null;
  return (
    <span className={`text-xs font-bold ${d.up ? "text-ok" : "text-danger"}`}>
      {d.up ? "▲" : "▼"} {d.pct}%
    </span>
  );
}

/** Margin, or an em dash when no line in the row carries a cost. */
function Margin({ g }: { g: SalesGroup }) {
  const pct = marginPct(g);
  if (pct == null) {
    return (
      <span className="text-brown-800/70" title="Nessun costo di acquisto sui prodotti di questa riga">
        —
      </span>
    );
  }
  return (
    <span className={`font-semibold ${g.marginCents >= 0 ? "text-ok" : "text-danger"}`}>
      {euro(g.marginCents)} · {pct}%
    </span>
  );
}

/**
 * A ranked table. `share` draws the revenue bar, so the eye finds the big rows
 * before it reads any number.
 */
function GroupTable({
  rows,
  head,
  hrefFor,
}: {
  rows: SalesGroup[];
  head: string;
  hrefFor?: (g: SalesGroup) => string | null;
}) {
  const max = Math.max(1, ...rows.map((r) => r.grossCents));
  return (
    <div className="scroll-x">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brown-900/10 text-left text-[12px] tracking-widest text-brown-800/70 uppercase">
            <th scope="col" className="pb-2 font-bold">{head}</th>
            <th scope="col" className="pb-2 text-right font-bold">Quantità</th>
            <th scope="col" className="pb-2 text-right font-bold">Incasso</th>
            <th scope="col" className="pb-2 text-right font-bold">Imponibile</th>
            <th scope="col" className="pb-2 text-right font-bold">Costo</th>
            <th scope="col" className="pb-2 text-right font-bold">Margine</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brown-900/10">
          {rows.map((g) => {
            const href = hrefFor?.(g) ?? null;
            return (
              <tr key={g.key}>
                <td className="py-2 text-brown-950">
                  {href ? (
                    <Link href={href} className="font-semibold hover:underline">
                      {g.label}
                    </Link>
                  ) : (
                    <span className="font-semibold">{g.label}</span>
                  )}
                  <span className="mt-1 block h-1 w-full max-w-40 overflow-hidden rounded-full bg-brown-900/10">
                    <span
                      className="block h-full rounded-full bg-gold-deep"
                      style={{ width: `${Math.round((g.grossCents / max) * 100)}%` }}
                    />
                  </span>
                  {g.uncostedLines > 0 && (
                    <span className="mt-0.5 block text-[11px] text-brown-800/70">
                      {g.uncostedLines}{" "}
                      {g.uncostedLines === 1 ? "riga senza costo" : "righe senza costo"}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums text-brown-800/80">{units(g.units)}</td>
                <td className="py-2 text-right tabular-nums font-semibold text-brown-950">
                  {euro(g.grossCents)}
                </td>
                <td className="py-2 text-right tabular-nums text-brown-800/80">{euro(g.netCents)}</td>
                <td className="py-2 text-right tabular-nums text-brown-800/80">
                  {g.costCents > 0 ? euro(g.costCents) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums">
                  <Margin g={g} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: { pct: number; up: boolean } | null;
}) {
  return (
    <Panel>
      <p className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">{label}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <p className="font-display text-xl font-bold tabular-nums text-brown-950 sm:text-2xl">
          {value}
        </p>
        {delta !== undefined && <Delta d={delta ?? null} />}
      </div>
      {hint && <p className="mt-1 text-xs text-brown-800/70">{hint}</p>}
    </Panel>
  );
}

/**
 * Analisi vendite — what sold, and what the shop kept on it.
 *
 * The gestionale could already say what came in (`/admin`, chiusura di cassa)
 * and what the taxman is owed (riepilogo IVA). It could not say what any of it
 * *earned*: `cost_cents` was captured on most of the catalogue and read by one
 * screen, for one product at a time. Nor could it answer the question a shop
 * with two counters and five categories actually asks — how did salumi do
 * against formaggi this quarter, and at which sede.
 *
 * The margin here is not the fiscal truth and does not pretend to be. It uses
 * the *current* purchase cost, because `order_items` snapshots price and VAT but
 * never cost; and it covers only the lines that have one. Both facts are on the
 * page rather than in a comment, because a margin figure whose coverage is
 * unstated is a number people quote.
 */
export default async function SalesReport({ searchParams }: SP) {
  const sp = await searchParams;
  const scope = await shopScope();
  const shopFilter = lockShop(sp.negozio, scope) ?? "all";
  const period = vatPeriod({ da: sp.da, a: sp.a, periodo: sp.periodo });

  const shops = await adminGetShops();
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));
  const { current, previous } = await getSalesAnalysis(
    period.from,
    period.toExclusive,
    shopFilter,
    scope,
    (slug) => (slug ? (shopName.get(slug) ?? slug) : "Spedizioni / senza sede"),
  );

  const t = current.totals;
  const p = previous.totals;
  const pct = marginPct(t);
  const coveragePct = Math.round(t.coverage * 100);

  const qs = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({
      negozio: shopFilter,
      da: period.fromISO,
      a: period.toISO,
      ...extra,
    })) {
      if (v && v !== "all") u.set(k, v);
    }
    const s = u.toString();
    return s ? `?${s}` : "";
  };
  const presetHref = (key: VatPresetKey) =>
    `${BASE}?periodo=${key}${shopFilter !== "all" ? `&negozio=${shopFilter}` : ""}`;

  const chips = shopChips(shops, scope);
  const empty = t.lines === 0;

  return (
    <div>
      <AdminHeader
        title="Analisi vendite"
        subtitle={`Dal ${period.fromISO} al ${period.toISO} — cosa è stato venduto e quanto ci resta`}
        action={<PrintButton>Stampa</PrintButton>}
      />

      <Panel className="mb-6 print:hidden">
        <div className="mb-4 flex flex-wrap gap-2">
          {VAT_PRESETS.map((preset) => (
            <a
              key={preset.key}
              href={presetHref(preset.key)}
              className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
                period.preset === preset.key
                  ? "bg-brown-950 text-cream"
                  : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
              }`}
            >
              {preset.label}
            </a>
          ))}
        </div>
        <form action={BASE} method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls} htmlFor="v-da">Dal</label>
            <input id="v-da" type="date" name="da" defaultValue={period.fromISO} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="v-a">Al</label>
            <input id="v-a" type="date" name="a" defaultValue={period.toISO} className={inputCls} />
          </div>
          {/* Preserved across an explicit date submit, or choosing a range would
              silently widen the report back to every sede. */}
          {shopFilter !== "all" && <input type="hidden" name="negozio" value={shopFilter} />}
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
          >
            Aggiorna
          </button>
        </form>
        <div className="mt-4">
          <SegmentedFilter
            basePath={BASE}
            params={{ negozio: shopFilter, da: period.fromISO, a: period.toISO }}
            name="negozio"
            options={chips}
            label="Filtra per sede"
          />
        </div>
      </Panel>

      {empty ? (
        <Panel>
          <p className="text-brown-800/70">
            Nessuna vendita incassata nel periodo selezionato.
          </p>
        </Panel>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Kpi
              label="Incasso merce"
              value={euro(t.grossCents)}
              hint={`${t.orders} ordini · al netto degli sconti`}
              delta={pctDelta(t.grossCents, p.grossCents)}
            />
            <Kpi
              label="Imponibile"
              value={euro(t.netCents)}
              hint="scorporata l'IVA"
            />
            <Kpi
              label="Costo del venduto"
              value={euro(t.costCents)}
              hint={`su ${coveragePct}% dell'imponibile`}
            />
            <Kpi
              label="Margine"
              value={pct == null ? "—" : `${euro(t.marginCents)} · ${pct}%`}
              hint="imponibile − costo"
              delta={pctDelta(t.marginCents, p.marginCents)}
            />
          </div>

          {/* The honesty panel. A margin percentage with unstated coverage is
              the number that ends up in a decision; this says what it describes
              and what it leaves out, and links to the products that are missing
              a cost so the gap can actually be closed. */}
          <Panel className={coveragePct < 100 ? "border-warn/40 bg-warn-soft" : ""}>
            <h2 className="font-display text-lg text-brown-950">Come leggere il margine</h2>
            <ul className="mt-2 space-y-1 text-sm text-brown-800/80">
              <li>
                Calcolato sull&apos;<strong>imponibile</strong>, non sul prezzo di vendita: i
                prezzi sono ivati e il costo d&apos;acquisto no, quindi sottrarre l&apos;uno
                dall&apos;altro gonfierebbe il margine di tutta l&apos;IVA.
              </li>
              <li>
                Copre il <strong>{coveragePct}%</strong> dell&apos;imponibile del periodo.
                {t.uncostedLines > 0 && (
                  <>
                    {" "}
                    {t.uncostedLines}{" "}
                    {t.uncostedLines === 1 ? "riga venduta non ha" : "righe vendute non hanno"} un
                    costo d&apos;acquisto sul prodotto e {t.uncostedLines === 1 ? "resta" : "restano"}{" "}
                    fuori dal calcolo —{" "}
                    <Link href="/admin/products" className="font-semibold text-gold-deep underline">
                      completa i costi in catalogo
                    </Link>{" "}
                    per chiudere il vuoto.
                  </>
                )}
              </li>
              <li>
                Usa il costo d&apos;acquisto <strong>attuale</strong>: l&apos;ordine registra
                prezzo e aliquota, non il costo del giorno. Su un periodo in cui i prezzi
                d&apos;acquisto sono cambiati è una stima.
              </li>
              <li>La spedizione non è merce e non entra in nessuna riga di questa pagina.</li>
            </ul>
          </Panel>

          <Panel>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg text-brown-950">Per categoria</h2>
              <p className="text-xs text-brown-800/70">
                Confronto con i {Math.round((period.toExclusive.getTime() - period.from.getTime()) / 86400000)} giorni
                precedenti
              </p>
            </div>
            <GroupTable
              rows={current.byCategory}
              head="Categoria"
              hrefFor={(g) => (g.key === "—" ? null : `/admin/products?q=${encodeURIComponent(g.key)}`)}
            />
          </Panel>

          {current.byShop.length > 1 && (
            <Panel>
              <h2 className="font-display mb-3 text-lg text-brown-950">Per sede</h2>
              <GroupTable rows={current.byShop} head="Sede" />
            </Panel>
          )}

          <Panel>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg text-brown-950">Per prodotto</h2>
              <Link
                href={`/api/admin/export/vendite${qs({})}`}
                className="text-[12px] font-bold tracking-widest text-gold-deep uppercase hover:underline"
                download
              >
                Esporta CSV →
              </Link>
            </div>
            <GroupTable
              rows={current.byProduct}
              head="Prodotto"
              hrefFor={(g) => (g.key.startsWith("n:") ? null : `/admin/products/${g.key}`)}
            />
          </Panel>
        </div>
      )}
    </div>
  );
}
