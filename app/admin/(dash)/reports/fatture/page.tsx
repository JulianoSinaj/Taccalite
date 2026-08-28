import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, euro, fmtDate, inputCls, labelCls } from "@/components/admin/ui";
import { PrintButton } from "@/components/admin/PrintButton";
import { getInvoiceRegister, adminGetShops } from "@/lib/admin/queries";
import { invoiceRegisterStatus, invoiceRegisterMatches } from "@/lib/admin/filters";
import { isAdmin } from "@/lib/auth/session";
import { vatPeriod, VAT_PRESETS, type VatPresetKey } from "@/lib/fiscal-period";

export const dynamic = "force-dynamic";

const BASE = "/admin/reports/fatture";

type SP = { searchParams: Promise<{ da?: string; a?: string; periodo?: string; stato?: string }> };

const FILTERS = [
  { value: "all", label: "Tutte le vendite" },
  { value: "emesse", label: "Con fattura" },
  { value: "da-emettere", label: "Senza fattura" },
  { value: "note", label: "Con nota di credito" },
];

/**
 * Registro fatture — which sales have a document, and which are still waiting.
 *
 * The XML has been generatable per order for a long time, and there was nowhere
 * to see the result: no list of what had been issued, no way to find the orders
 * still owed a document, and nothing to hand a commercialista who asks what went
 * out in July. Assembled from the audit trail, which has recorded every
 * generation all along.
 */
export default async function InvoiceRegister({ searchParams }: SP) {
  // Invoices are the business's fiscal identity in someone else's inbox.
  if (!(await isAdmin())) redirect("/admin");
  const sp = await searchParams;
  const { da, a, periodo } = sp;
  const period = vatPeriod({ da, a, periodo });
  // Read through the same helper the export uses, so a hand-typed `stato` can
  // never filter the screen one way and the CSV another.
  const stato = invoiceRegisterStatus(sp);

  const [rows, shops] = await Promise.all([
    getInvoiceRegister(period.from, period.toExclusive),
    adminGetShops(),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));

  const visible = rows.filter((r) => invoiceRegisterMatches(r, stato));

  // Carries the period and the active facet, so the download is the view.
  const exportQs = new URLSearchParams({ da: period.fromISO, a: period.toISO });
  if (stato !== "all") exportQs.set("stato", stato);

  const issued = rows.filter((r) => r.invoicedAt).length;
  const pending = rows.length - issued;
  const issuedCents = rows
    .filter((r) => r.invoicedAt)
    .reduce((s, r) => s + r.totalCents - r.refundedCents, 0);

  const href = (params: Record<string, string>) => {
    const qs = new URLSearchParams({ da: period.fromISO, a: period.toISO, stato, ...params });
    for (const [k, v] of [...qs.entries()]) if (v === "all") qs.delete(k);
    return `${BASE}?${qs.toString()}`;
  };

  return (
    <div>
      <AdminHeader
        title="Registro fatture"
        subtitle={`${rows.length} vendite incassate tra il ${period.fromISO} e il ${period.toISO} · ${issued} con fattura, ${pending} senza`}
        action={<PrintButton>Stampa</PrintButton>}
      />

      <Panel className="mb-6 print:hidden">
        <div className="mb-4 flex flex-wrap gap-2">
          {VAT_PRESETS.map((p) => (
            <a
              key={p.key}
              href={`${BASE}?periodo=${p.key as VatPresetKey}${stato !== "all" ? `&stato=${stato}` : ""}`}
              className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
                period.preset === p.key
                  ? "bg-brown-950 text-cream"
                  : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>
        <form action={BASE} method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="stato" value={stato} />
          <div>
            <label className={labelCls} htmlFor="fat-da">
              Dal
            </label>
            <input id="fat-da" type="date" name="da" defaultValue={period.fromISO} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="fat-a">
              Al
            </label>
            <input id="fat-a" type="date" name="a" defaultValue={period.toISO} className={inputCls} />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
          >
            Aggiorna
          </button>
          <a
            href={`/api/admin/export/fatture?${exportQs.toString()}`}
            download
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Esporta CSV
          </a>
        </form>
      </Panel>

      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={href({ stato: f.value })}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              stato === f.value
                ? "bg-brown-950 text-cream"
                : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessuna vendita in questa vista.</p>
        </Panel>
      ) : (
        <Panel>
          <div className="scroll-x">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brown-900/10 text-left text-[12px] tracking-widest text-brown-800/70 uppercase">
                  <th scope="col" className="pb-2 font-bold">Documento</th>
                  <th scope="col" className="pb-2 font-bold">Cliente</th>
                  <th scope="col" className="pb-2 font-bold">Incassata</th>
                  <th scope="col" className="pb-2 text-right font-bold">Totale</th>
                  <th scope="col" className="pb-2 font-bold">Stato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brown-900/10">
                {visible.map((r) => (
                  <tr key={r.orderId}>
                    <td className="py-2">
                      <Link
                        href={`/admin/orders/${r.orderId}`}
                        className="font-mono font-semibold text-brown-950 hover:underline"
                      >
                        {r.orderNumber}
                      </Link>
                      {r.shopSlug && (
                        <span className="ml-2 text-xs text-brown-800/70">
                          {shopName.get(r.shopSlug) ?? r.shopSlug}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-brown-950">
                      {r.name}
                      {!r.hasFiscalIdentity && (
                        <span className="ml-2 text-xs text-brown-800/70">
                          senza codice fiscale
                        </span>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap text-brown-800/70">
                      {fmtDate(r.settledAt)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-brown-950">
                      {euro(r.totalCents - r.refundedCents)}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {r.invoicedAt ? (
                          <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-bold text-ok-soft-fg uppercase">
                            Fattura {fmtDate(r.invoicedAt)}
                          </span>
                        ) : (
                          <a
                            href={`/api/admin/invoice/${r.orderId}/xml`}
                            download
                            className="rounded-full bg-brown-900/10 px-2.5 py-0.5 text-[11px] font-bold text-brown-950 uppercase hover:bg-brown-900/15"
                          >
                            Genera XML
                          </a>
                        )}
                        {r.creditNoteAt && (
                          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger-soft-fg uppercase">
                            Nota {fmtDate(r.creditNoteAt)}
                          </span>
                        )}
                        {r.refundedCents > 0 && !r.creditNoteAt && (
                          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold text-warn-soft-fg uppercase">
                            Rimborsata, nota da emettere
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <p className="mt-4 max-w-3xl text-xs text-brown-800/70">
        Totale fatturato nel periodo: <strong>{euro(issuedCents)}</strong>. Il registro è ricostruito
        dal{" "}
        <Link href="/admin/audit?entity=order" className="font-semibold text-gold-deep underline">
          registro attività
        </Link>
        , che annota ogni generazione di XML. Il numero del documento è il numero d&apos;ordine, che
        non è progressivo: per una numerazione sequenziale servirebbe un registro dedicato — parlane
        col commercialista prima di usarlo come tale. Gli importi sono al netto dei rimborsi; il
        dettaglio per aliquota è nel{" "}
        <Link href="/admin/reports/iva" className="font-semibold text-gold-deep underline">
          riepilogo IVA
        </Link>
        .
      </p>
    </div>
  );
}
