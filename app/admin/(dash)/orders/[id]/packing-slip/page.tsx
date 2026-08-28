import { notFound } from "next/navigation";
import { BackLink, euro, fmtDate } from "@/components/admin/ui";
import { PrintButton } from "@/components/admin/PrintButton";
import { adminGetOrder, adminGetShops } from "@/lib/admin/queries";
import { getSetting } from "@/lib/db/queries";
import { assertShopScope } from "@/lib/admin/scope";
import { orderVatBuckets, vatRateLabel, totalImposta } from "@/lib/fiscal";

import { FULFILMENT_LABEL } from "@/lib/fulfilment";

export const dynamic = "force-dynamic";

/**
 * Counter document for an order: what to pick, for whom, and where it goes.
 *
 * Print-first — the admin chrome and the on-screen controls are `print:hidden`,
 * so what comes out of the printer is just the document. Internal notes are
 * deliberately NOT printed: this sheet can end up in the customer's bag.
 */
export default async function PackingSlip({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, shops, business] = await Promise.all([
    adminGetOrder(id),
    adminGetShops(),
    Promise.all([
      getSetting<string>("business.legalName", "Norcineria Taccalite"),
      getSetting<string>("business.vatNumber", ""),
      getSetting<string>("business.address", ""),
      getSetting<string>("business.zip", ""),
      getSetting<string>("business.city", ""),
      getSetting<string>("business.province", ""),
      getSetting<number>("store.shippingVatRate", 22),
    ]),
  ]);
  if (!data) notFound();
  // The order detail page has always refused another location's record; this one
  // did not, so the same customer's name, address, phone and total were one URL
  // segment further along. Both ends of the same door.
  await assertShopScope(data.order.shopSlug);

  const { order, items } = data;
  const [legalName, vatNumber, address, zip, city, province, shippingVatPct] = business;
  const shop = order.shopSlug ? shops.find((s) => s.slug === order.shopSlug) : null;
  const addr = order.shippingAddress;

  const vat = orderVatBuckets({
    items: items.map((i) => ({ grossCents: i.lineTotalCents, vatRateBps: i.vatRateBps })),
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    shippingVatBps: Math.round(shippingVatPct * 100),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href={`/admin/orders/${order.id}`}>Torna all&apos;ordine</BackLink>
        <PrintButton>Stampa documento</PrintButton>
      </div>

      {order.internalNotes && (
        <p className="mb-4 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-brown-900 print:hidden">
          <span className="text-[11px] font-bold tracking-widest text-brown-800/70 uppercase">
            Nota interna (non stampata)
          </span>
          <br />
          {order.internalNotes}
        </p>
      )}

      {/* The printed document. */}
      <article className="rounded-2xl border border-brown-900/10 bg-surface p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-brown-900/15 pb-5">
          <div>
            <p className="font-display text-2xl font-bold tracking-tight text-brown-950 uppercase">
              {legalName}
            </p>
            <p className="mt-1 text-xs text-brown-800/70">
              {[address, [zip, city, province && `(${province})`].filter(Boolean).join(" ")]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {vatNumber && <p className="text-xs text-brown-800/70">P.IVA {vatNumber}</p>}
          </div>
          <div className="text-right">
            <p className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
              Documento di consegna
            </p>
            <p className="font-display text-xl font-bold text-brown-950">{order.orderNumber}</p>
            <p className="text-xs text-brown-800/70">{fmtDate(order.createdAt)}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 border-b border-brown-900/15 py-5 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
              Cliente
            </p>
            <p className="font-semibold text-brown-950">{order.name}</p>
            {order.phone && <p className="text-sm text-brown-800/80">{order.phone}</p>}
            {order.email && <p className="text-sm text-brown-800/80">{order.email}</p>}
          </div>
          <div>
            <p className="mb-1 text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
              {order.fulfilment === "pickup" ? "Ritiro presso" : FULFILMENT_LABEL[order.fulfilment] + " a"}
            </p>
            {order.fulfilment !== "pickup" ? (
              addr ? (
                <p className="text-sm text-brown-950">
                  {addr.address}
                  <br />
                  {addr.zip} {addr.city}
                </p>
              ) : (
                <p className="text-sm text-brown-800/70">Indirizzo non indicato</p>
              )
            ) : (
              <p className="text-sm text-brown-950">
                {shop?.name ?? order.shopSlug ?? "—"}
                {shop?.address ? (
                  <>
                    <br />
                    {shop.address}
                  </>
                ) : null}
              </p>
            )}
          </div>
        </section>

        <section className="py-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brown-900/15 text-left text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
                <th scope="col" className="pb-2">Articolo</th>
                <th scope="col" className="pb-2 text-center">Qtà</th>
                <th scope="col" className="pb-2 text-right">Prezzo</th>
                <th scope="col" className="pb-2 text-right">Totale</th>
                {/* A tick box for the person picking the order. */}
                <th scope="col" className="pb-2 text-center print:table-cell">✓</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brown-900/10">
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="py-2.5 text-brown-950">{i.name}</td>
                  <td className="py-2.5 text-center font-semibold tabular-nums text-brown-950">
                    {/* The person picking needs the weight, not "1". */}
                    {i.weightKg != null
                      ? `${i.weightKg.toLocaleString("it-IT", { maximumFractionDigits: 3 })} kg`
                      : i.quantity}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-brown-800/80">
                    {euro(i.unitPriceCents)}
                    {i.weightKg != null ? "/kg" : ""}
                  </td>
                  <td className="py-2.5 text-right tabular-nums font-semibold text-brown-950">
                    {euro(i.lineTotalCents)}
                  </td>
                  <td className="py-2.5 text-center">
                    <span className="inline-block size-4 rounded border border-brown-900/30 align-middle" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ml-auto max-w-xs space-y-1 border-t border-brown-900/15 pt-4 text-sm">
          <div className="flex justify-between text-brown-800/70">
            <span>Subtotale</span>
            <span className="tabular-nums">{euro(order.subtotalCents)}</span>
          </div>
          {order.discountCents > 0 && (
            <div className="flex justify-between text-brown-800/70">
              <span>Sconto{order.discountCode ? ` (${order.discountCode})` : ""}</span>
              <span className="tabular-nums">−{euro(order.discountCents)}</span>
            </div>
          )}
          {order.fulfilment === "shipping" && (
            <div className="flex justify-between text-brown-800/70">
              <span>Spedizione</span>
              <span className="tabular-nums">{euro(order.shippingCents)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-brown-900/15 pt-2 font-display text-lg font-bold text-brown-950">
            <span>Totale</span>
            <span className="tabular-nums">{euro(order.totalCents)}</span>
          </div>
          {vat.length > 0 && (
            <p className="pt-1 text-[12px] text-brown-800/70">
              Prezzi ivati · IVA{" "}
              {vat.map((b) => `${vatRateLabel(b.rateBps)} ${euro(b.impostaCents)}`).join(" · ")} (tot.{" "}
              {euro(totalImposta(vat))})
            </p>
          )}
        </section>

        {order.notes && (
          <section className="mt-4 border-t border-brown-900/15 pt-4">
            <p className="mb-1 text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
              Note del cliente
            </p>
            <p className="text-sm text-brown-800/80">{order.notes}</p>
          </section>
        )}

        <footer className="mt-8 flex items-end justify-between gap-8 border-t border-brown-900/15 pt-5 text-xs text-brown-800/70">
          <span>
            Documento non fiscale · non sostituisce lo scontrino o la fattura elettronica.
          </span>
          <span className="shrink-0">
            Firma per ritiro
            <span className="mt-6 block w-48 border-b border-brown-900/30" />
          </span>
        </footer>
      </article>
    </div>
  );
}
