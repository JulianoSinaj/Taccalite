import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, euro, inputCls, labelCls } from "@/components/admin/ui";
import { getVatReport, adminGetShops } from "@/lib/admin/queries";
import { getSetting } from "@/lib/db/queries";
import { isAdmin } from "@/lib/auth/session";
import { vatRateLabel, totalImposta, type VatBucket } from "@/lib/fiscal";
import { vatPeriod, VAT_PRESETS, type VatPresetKey } from "@/lib/fiscal-period";

export const dynamic = "force-dynamic";

type SP = { searchParams: Promise<{ da?: string; a?: string; periodo?: string }> };

/** One rate-by-rate table. `tone` colours a reversal block as a credit note. */
function VatTable({
  buckets,
  tone = "normal",
}: {
  buckets: VatBucket[];
  tone?: "normal" | "credit";
}) {
  const base = buckets.reduce((s, b) => s + b.imponibileCents, 0);
  const tax = totalImposta(buckets);
  const gross = buckets.reduce((s, b) => s + b.grossCents, 0);
  const num = tone === "credit" ? "text-danger" : "text-brown-900";

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-brown-900/10 text-left text-[11px] tracking-widest text-brown-800/60 uppercase">
          <th className="pb-2 font-bold">Aliquota</th>
          <th className="pb-2 text-right font-bold">Imponibile</th>
          <th className="pb-2 text-right font-bold">Imposta</th>
          <th className="pb-2 text-right font-bold">Totale ivato</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-brown-900/10">
        {buckets.map((b) => (
          <tr key={b.rateBps}>
            <td className="py-2 font-semibold text-brown-950">IVA {vatRateLabel(b.rateBps)}</td>
            <td className={`py-2 text-right tabular-nums ${num}`}>{euro(b.imponibileCents)}</td>
            <td className={`py-2 text-right tabular-nums ${num}`}>{euro(b.impostaCents)}</td>
            <td className={`py-2 text-right tabular-nums ${num}`}>{euro(b.grossCents)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-display border-t-2 border-brown-900/15 text-brown-950">
          <td className="pt-3 font-bold">Totale</td>
          <td className="pt-3 text-right font-bold tabular-nums">{euro(base)}</td>
          <td className="pt-3 text-right font-bold tabular-nums">{euro(tax)}</td>
          <td className="pt-3 text-right font-bold tabular-nums">{euro(gross)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default async function VatReport({ searchParams }: SP) {
  if (!(await isAdmin())) redirect("/admin");
  const { da, a, periodo } = await searchParams;

  // Period resolution (including "this month" / "last quarter" presets) lives in
  // a plain helper so no `new Date()` runs in the component body.
  const period = vatPeriod({ da, a, periodo });

  const [report, legalName, vatNumber, shops] = await Promise.all([
    getVatReport(period.from, period.toExclusive),
    getSetting<string>("business.legalName", "Norcineria Taccalite"),
    getSetting<string>("business.vatNumber", ""),
    adminGetShops(),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));

  const netTax = totalImposta(report.buckets);
  const exportQs = `da=${period.fromISO}&a=${period.toISO}`;
  const presetHref = (key: VatPresetKey) => `/admin/reports/iva?periodo=${key}`;

  return (
    <div>
      <AdminHeader
        title="Riepilogo IVA"
        subtitle={`${legalName}${vatNumber ? ` · P.IVA ${vatNumber}` : ""} — imponibile e imposta per aliquota`}
      />

      <Panel className="mb-6">
        <div className="mb-4 flex flex-wrap gap-2">
          {VAT_PRESETS.map((p) => (
            <a
              key={p.key}
              href={presetHref(p.key)}
              className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
                period.preset === p.key
                  ? "bg-brown-950 text-cream"
                  : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>
        <form action="/admin/reports/iva" method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls} htmlFor="iva-da">
              Dal
            </label>
            <input id="iva-da" type="date" name="da" defaultValue={period.fromISO} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="iva-a">
              Al
            </label>
            <input id="iva-a" type="date" name="a" defaultValue={period.toISO} className={inputCls} />
          </div>
          <button
            type="submit"
            className="rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
          >
            Aggiorna
          </button>
          <a
            href={`/api/admin/export/iva?${exportQs}`}
            download
            className="rounded-full bg-brown-900/10 px-4 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Esporta CSV
          </a>
        </form>
      </Panel>

      {report.buckets.length === 0 && report.sales.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun movimento IVA nel periodo selezionato.</p>
        </Panel>
      ) : (
        <div className="space-y-6">
          <Panel>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg text-brown-950">IVA a debito del periodo</h2>
              <p className="font-display text-2xl font-bold text-brown-950">{euro(netTax)}</p>
            </div>
            <VatTable buckets={report.buckets} />
            <p className="mt-3 text-xs text-brown-800/60">
              Vendite incassate nel periodo, al netto delle note di credito emesse nel periodo.
            </p>
          </Panel>

          <Panel>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg text-brown-950">Vendite</h2>
              {/* Drill-down: the orders behind the numbers, same window. */}
              <Link
                href={`/admin/orders?stato=paid&da=${period.fromISO}&a=${period.toISO}`}
                className="text-[11px] font-bold tracking-widest text-gold-deep uppercase hover:underline"
              >
                Vedi gli ordini →
              </Link>
            </div>
            <p className="mb-3 text-xs text-brown-800/60">
              {report.salesCount} ordini incassati tra il {period.fromISO} e il {period.toISO}, al lordo
              di eventuali rimborsi successivi.
            </p>
            <VatTable buckets={report.sales} />
          </Panel>

          {/* Per location, so the two shops reconcile separately. */}
          {report.byShop.length > 1 && (
            <Panel>
              <h2 className="font-display mb-3 text-lg text-brown-950">Netto per sede</h2>
              <div className="space-y-6">
                {report.byShop.map((s) => (
                  <div key={s.shopSlug ?? "spedizioni"}>
                    <p className="mb-2 text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">
                      {s.shopSlug ? (shopName.get(s.shopSlug) ?? s.shopSlug) : "Spedizioni / senza sede"}
                      {" · "}
                      {euro(totalImposta(s.buckets))} di imposta
                    </p>
                    <VatTable buckets={s.buckets} />
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {report.reversals.length > 0 && (
            <Panel className="border-danger/30">
              <h2 className="font-display mb-1 text-lg text-brown-950">Note di credito (rimborsi)</h2>
              <p className="mb-3 text-xs text-brown-800/60">
                {report.reversalCount} ordini rimborsati in questo periodo. Il rimborso viene registrato
                qui, nel periodo in cui il denaro è stato restituito: la vendita resta nel periodo in cui
                è stata incassata, che potrebbe essere già stato dichiarato.
              </p>
              <VatTable buckets={report.reversals} tone="credit" />
            </Panel>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-brown-800/60">
        I prezzi sono comprensivi di IVA. La spedizione è calcolata all&apos;aliquota del{" "}
        {vatRateLabel(report.shippingVatBps)} (modificabile in Impostazioni ·{" "}
        <code>store.shippingVatRate</code>). Documento di sintesi per il commercialista — non
        sostituisce la liquidazione IVA ufficiale.
      </p>
    </div>
  );
}
