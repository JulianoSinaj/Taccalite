import { redirect } from "next/navigation";
import { AdminHeader, Panel, euro, inputCls, labelCls } from "@/components/admin/ui";
import { getVatReport } from "@/lib/admin/queries";
import { getSetting } from "@/lib/db/queries";
import { isAdmin } from "@/lib/auth/session";
import { vatBreakdown, vatRateLabel, totalImposta } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

/** yyyy-mm-dd for an input[type=date] default value. */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type SP = { searchParams: Promise<{ da?: string; a?: string }> };

export default async function VatReport({ searchParams }: SP) {
  if (!(await isAdmin())) redirect("/admin");
  const { da, a } = await searchParams;

  // Default range: the current calendar month up to today.
  const now = new Date();
  const defFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = da ? new Date(`${da}T00:00:00`) : defFrom;
  const to = a ? new Date(`${a}T23:59:59`) : now;

  const [{ lines, shippingGrossCents }, shippingVatPct, legalName, vatNumber] = await Promise.all([
    getVatReport(from, to),
    getSetting<number>("store.shippingVatRate", 22),
    getSetting<string>("business.legalName", "Norcineria Taccalite"),
    getSetting<string>("business.vatNumber", ""),
  ]);

  const shippingVatBps = Math.round(shippingVatPct * 100);
  // Combine product lines with a shipping line (at its configured rate) into buckets.
  const buckets = vatBreakdown([
    ...lines.map((l) => ({ grossCents: l.grossCents, vatRateBps: l.vatRateBps })),
    ...(shippingGrossCents > 0 ? [{ grossCents: shippingGrossCents, vatRateBps: shippingVatBps }] : []),
  ]);

  const totalGross = buckets.reduce((s, b) => s + b.grossCents, 0);
  const totalBase = buckets.reduce((s, b) => s + b.imponibileCents, 0);
  const totalTax = totalImposta(buckets);

  return (
    <div>
      <AdminHeader
        title="Riepilogo IVA"
        subtitle={`${legalName}${vatNumber ? ` · P.IVA ${vatNumber}` : ""} — imponibile e imposta per aliquota (ordini pagati)`}
      />

      <Panel className="mb-6">
        <form action="/admin/reports/iva" method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls}>Dal</label>
            <input type="date" name="da" defaultValue={iso(from)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Al</label>
            <input type="date" name="a" defaultValue={iso(to)} className={inputCls} />
          </div>
          <button
            type="submit"
            className="rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
          >
            Aggiorna
          </button>
          <a
            href={`/api/admin/export/iva?da=${iso(from)}&a=${iso(to)}`}
            download
            className="rounded-full bg-brown-900/10 px-4 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Esporta CSV
          </a>
        </form>
      </Panel>

      <Panel>
        {buckets.length === 0 ? (
          <p className="text-brown-800/70">Nessun ordine pagato nel periodo selezionato.</p>
        ) : (
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
                  <td className="py-2 text-right text-brown-900">{euro(b.imponibileCents)}</td>
                  <td className="py-2 text-right text-brown-900">{euro(b.impostaCents)}</td>
                  <td className="py-2 text-right text-brown-900">{euro(b.grossCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-brown-900/15 font-display text-brown-950">
                <td className="pt-3 font-bold">Totale</td>
                <td className="pt-3 text-right font-bold">{euro(totalBase)}</td>
                <td className="pt-3 text-right font-bold">{euro(totalTax)}</td>
                <td className="pt-3 text-right font-bold">{euro(totalGross)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="mt-4 text-xs text-brown-800/60">
          I prezzi sono comprensivi di IVA. La spedizione è calcolata all&apos;aliquota del{" "}
          {vatRateLabel(shippingVatBps)} (modificabile in Impostazioni · <code>store.shippingVatRate</code>).
          Documento di sintesi per il commercialista — non sostituisce la liquidazione IVA ufficiale.
        </p>
      </Panel>
    </div>
  );
}
