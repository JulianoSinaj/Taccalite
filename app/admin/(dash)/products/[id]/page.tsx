import { notFound } from "next/navigation";
import { AdminHeader, Panel, BackLink, HistoryLink, inputCls, labelCls, fmtDate, euro } from "@/components/admin/ui";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { ProductForm } from "@/components/admin/forms";
import {
  adminGetProduct,
  adminGetShops,
  getStockMovements,
  adminGetCategories,
  getProductBatches,
  getProductHistoryCounts,
  getProductSales,
} from "@/lib/admin/queries";
import { BatchPanel } from "@/components/admin/BatchPanel";
import { dateInRome } from "@/lib/time";
import { adjustStock, archiveProduct, deleteProduct, duplicateProduct } from "@/lib/admin/actions";
import { listPendingStockNotifications } from "@/lib/stock-notify";
import { notifyStockWaitlist } from "@/lib/admin/batch-actions";
import { margin } from "@/lib/inventory";
import { assertShopScope, shopScope } from "@/lib/admin/scope";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, allShops, categories, admin, scope] = await Promise.all([
    adminGetProduct(id),
    adminGetShops(),
    adminGetCategories("product"),
    isAdmin(),
    shopScope(),
  ]);
  if (!product) notFound();
  // A filtered list is not access control: without this, another location
  // 's record is one typed URL away. `notFound` rather than a message —
  // "it exists but is not yours" is itself information.
  await assertShopScope(product.shopSlug);
  // A confined operator may not move a product to another sede either — the
  // action refuses, so the select offers only what would save.
  const shops = allShops.filter((s) => !scope || s.slug === scope);

  const productMargin = margin(product);

  const [movements, waitlist, batches] =
    product.stock != null
      ? await Promise.all([
          getStockMovements(product.id),
          listPendingStockNotifications(product.id),
          getProductBatches(product.id),
        ])
      : [[], [], []];
  const waiting = waitlist.length;
  const today = dateInRome();
  // Deleting cascades the ledger away and blanks the name on past order lines,
  // so the action refuses once either exists. Asking here means the button is
  // only offered where it can succeed, and the reason is on screen otherwise.
  const history = await getProductHistoryCounts(product.id);
  // Velocity, which nothing on this page could show: the only sales figure in
  // the gestionale was the dashboard's top five, and a reorder decision is made
  // one product at a time.
  const sales30 = await getProductSales(product.id, 30);
  const deletable = history.sold === 0 && history.movements === 0;
  // The public page 404s on anything not active *and* purchasable, so the link
  // is only shown where it leads somewhere.
  const liveOnSite = product.active && product.purchasable && !product.archivedAt;

  return (
    <div>
      <BackLink href="/admin/products">Prodotti</BackLink>
      <AdminHeader
        title={product.name}
        subtitle="Modifica prodotto"
        action={
          <div className="flex flex-wrap items-center gap-4">
            {/* Who changed this price, and when — the question the audit log
                exists for, and which the product page could not ask. */}
            {admin && <HistoryLink id={product.id} />}
            {liveOnSite && (
              <a
                href={`/negozio/${product.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
              >
                Vedi sul sito ↗
              </a>
            )}
            {/* A variant shares almost every field with its sibling. The copy
                is created switched off and opens for editing. */}
            <ActionForm action={duplicateProduct} className="inline-flex">
              <input type="hidden" name="id" value={product.id} />
              <PendingButton
                tone="dark"
                confirm={`Creare una copia di "${product.name}"? Nasce disattivata, non in vendita e senza giacenza, pronta da modificare.`}
              >
                Duplica
              </PendingButton>
            </ActionForm>
          </div>
        }
      />
      {product.archivedAt && (
        <p className="mb-4 rounded-lg border border-brown-900/10 bg-brown-900/5 px-4 py-3 text-sm text-brown-800/80">
          Prodotto archiviato il {fmtDate(product.archivedAt)}. Le modifiche si salvano, ma resta
          fuori dal catalogo e dal sito — e gli interruttori «Attivo», «Acquistabile online» e «In
          evidenza» restano spenti — finché non lo ripristini in fondo alla pagina.
        </p>
      )}
      <Panel>
        <ProductForm product={product} shops={shops} categories={categories} />
      </Panel>

      {/* Margin, once a purchase cost is on file. */}
      {productMargin && (
        <>
          <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Marginalità</h2>
          <Panel className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">Prezzo ivato</p>
              <p className="font-display mt-1 text-xl text-brown-950">{euro(product.priceCents)}</p>
            </div>
            <div>
              <p className="text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">Netto (imponibile)</p>
              <p className="font-display mt-1 text-xl text-brown-950">{euro(productMargin.netCents)}</p>
            </div>
            <div>
              <p className="text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">Costo</p>
              <p className="font-display mt-1 text-xl text-brown-950">{euro(product.costCents)}</p>
            </div>
            <div>
              <p className="text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">Margine</p>
              <p
                className={`font-display mt-1 text-xl font-bold ${
                  productMargin.marginCents >= 0 ? "text-ok" : "text-danger"
                }`}
              >
                {euro(productMargin.marginCents)} · {productMargin.marginPct}%
              </p>
            </div>
          </Panel>
          <p className="mt-2 text-xs text-brown-800/60">
            Il margine confronta il costo con l&apos;imponibile (prezzo al netto dell&apos;IVA), non con
            il prezzo esposto.
          </p>
        </>
      )}

      {/* Velocity — the question a reorder is decided on. */}
      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Venduto · ultimi 30 giorni</h2>
      <Panel className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">Quantità</p>
          <p className="font-display mt-1 text-xl text-brown-950">
            {sales30.weightKg > 0
              ? `${sales30.weightKg.toLocaleString("it-IT", { maximumFractionDigits: 3 })} kg`
              : sales30.units}
            {sales30.weightKg > 0 && sales30.units > 0 && (
              <span className="text-sm font-normal text-brown-800/60"> + {sales30.units} pz</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">Incasso</p>
          <p className="font-display mt-1 text-xl text-brown-950">{euro(sales30.cents)}</p>
        </div>
        <div>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">Ordini</p>
          <p className="font-display mt-1 text-xl text-brown-950">{sales30.orders}</p>
        </div>
        <div>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">
            Copertura
          </p>
          <p className="font-display mt-1 text-xl text-brown-950">
            {/* Days of stock left at the last 30 days' rate — the figure that
                turns "we have 12" into "that is four days". Pieces only: a
                line sold by weight does not consume stock (lib/stock.ts), so
                kilos do not belong in the divisor. */}
            {product.stock == null || sales30.units === 0
              ? "—"
              : `${Math.round((product.stock / (sales30.units / 30)) * 10) / 10} gg`}
          </p>
        </div>
      </Panel>

      {/* Inventory: quick stock adjustment + movement ledger */}
      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Giacenza e movimenti</h2>
      {product.stock == null ? (
        <Panel>
          <p className="text-sm text-brown-800/70">
            Questo prodotto non traccia le scorte. Imposta una giacenza nella scheda qui sopra per
            abilitare le rettifiche.
          </p>
        </Panel>
      ) : (
        <Panel>
          <p className="mb-4 text-sm text-brown-800/70">
            Giacenza attuale: <strong className="font-display text-lg text-brown-950">{product.stock}</strong>
            {waiting > 0 && (
              <span className="ml-3 rounded-full bg-gold/20 px-3 py-1 text-xs font-bold text-brown-950">
                {waiting} in attesa di riassortimento
              </span>
            )}
          </p>

          {/* This count used to be the end of the road: a number with nobody
              behind it and no button under it. The automatic notice fires on the
              transition out of zero, which misses a waitlist that built up while
              stock sat at one unit — so the operator needs a way to send it. */}
          {waiting > 0 && (
            <details className="mb-4 rounded-lg border border-gold/40 bg-gold/5 px-4 py-3">
              <summary className="w-fit cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/70 uppercase hover:text-brown-950">
                Chi è in attesa ({waiting})
              </summary>
              <ul className="mt-3 space-y-1 text-sm text-brown-800/80">
                {waitlist.map((w) => (
                  <li key={w.id} className="flex flex-wrap justify-between gap-2">
                    <span>{w.email}</span>
                    <span className="text-xs text-brown-800/50">dal {fmtDate(w.createdAt)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <ActionForm action={notifyStockWaitlist}>
                  <input type="hidden" name="productId" value={product.id} />
                  <PendingButton
                    tone="gold"
                    confirm={`Avvisare ${waiting} ${waiting === 1 ? "cliente" : "clienti"} che "${product.name}" è di nuovo disponibile?`}
                  >
                    Avvisa che è tornato disponibile
                  </PendingButton>
                </ActionForm>
                <p className="mt-2 text-xs text-brown-800/60">
                  L&apos;avviso parte da solo quando la giacenza risale da zero. Usa questo
                  pulsante se il prodotto è tornato disponibile senza passare per lo zero.
                </p>
              </div>
            </details>
          )}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">
                Rettifica
              </h3>
              <ActionForm action={adjustStock} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="mode" value="rettifica" />
                <div>
                  <label className={labelCls} htmlFor="delta">
                    Variazione
                  </label>
                  <input
                    id="delta"
                    name="delta"
                    type="number"
                    placeholder="es. 10 o -3"
                    required
                    className={`${inputCls} w-28`}
                  />
                </div>
                <div className="min-w-40 flex-1">
                  <label className={labelCls} htmlFor="reason">
                    Motivo
                  </label>
                  <input
                    id="reason"
                    name="reason"
                    placeholder="es. Carico fornitore, scarto"
                    className={inputCls}
                  />
                </div>
                <PendingButton tone="dark">Applica</PendingButton>
              </ActionForm>
              <p className="mt-2 text-xs text-brown-800/60">
                Positivo per caricare (arrivo merce), negativo per scaricare (scarto, rottura).
              </p>
            </div>

            {/* A count is an absolute figure, not a delta. Making the operator
                subtract by hand — against a number that can move while they
                count — was an invitation to get it wrong. */}
            <div className="border-t border-brown-900/10 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              <h3 className="mb-2 text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">
                Conteggio inventario
              </h3>
              <ActionForm action={adjustStock} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="mode" value="conteggio" />
                <div>
                  <label className={labelCls} htmlFor="counted">
                    Giacenza contata
                  </label>
                  <input
                    id="counted"
                    name="delta"
                    type="number"
                    min={0}
                    placeholder={String(product.stock)}
                    required
                    className={`${inputCls} w-28`}
                  />
                </div>
                <div className="min-w-40 flex-1">
                  <label className={labelCls} htmlFor="count-reason">
                    Nota
                  </label>
                  <input
                    id="count-reason"
                    name="reason"
                    placeholder="es. Inventario mensile"
                    className={inputCls}
                  />
                </div>
                <PendingButton tone="dark">Allinea</PendingButton>
              </ActionForm>
              <p className="mt-2 text-xs text-brown-800/60">
                Inserisci quanti pezzi ci sono davvero: la differenza viene registrata a ledger.
              </p>
            </div>
          </div>

          {movements.length > 0 && (
            <div className="mt-8">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">
                  Ultimi {movements.length} movimenti
                </p>
                {/* The ledger here is capped; this product's full one is a
                    download. Export is admin-only server-side, so the link is
                    only shown where it works. */}
                {admin && (
                  <a
                    href={`/api/admin/export/stock-movements?prodotto=${encodeURIComponent(product.id)}`}
                    download
                    className="text-[12px] font-bold tracking-widest text-gold-deep uppercase hover:underline"
                  >
                    Storico completo di questo prodotto (CSV)
                  </a>
                )}
              </div>
            <div className="scroll-x">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brown-900/10 text-left text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">
                    <th className="py-2">Data</th>
                    <th className="py-2">Motivo</th>
                    <th className="py-2 text-right">Variazione</th>
                    <th className="py-2 text-right">Giacenza</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brown-900/5">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 whitespace-nowrap text-brown-800/70">{fmtDate(m.createdAt)}</td>
                      <td className="py-2 text-brown-950">{m.reason || "—"}</td>
                      <td className={`py-2 text-right font-bold tabular-nums ${m.delta >= 0 ? "text-ok" : "text-danger"}`}>
                        {m.delta >= 0 ? `+${m.delta}` : m.delta}
                      </td>
                      <td className="py-2 text-right tabular-nums text-brown-950">{m.stockAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </Panel>
      )}

      {/* Lot + expiry tracking, for anything that carries a scadenza. */}
      {product.stock != null && (
        <>
          <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Tracciabilità</h2>
          <BatchPanel productId={product.id} batches={batches} today={today} />
        </>
      )}

      {/* Taking the product out of circulation. Archiving lived only in the
          list, and permanent deletion had no button anywhere — so a product
          created by mistake could only be archived, and the archive filled up
          with rows that never meant anything. */}
      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Ritiro dal catalogo</h2>
      <Panel className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-brown-950">
            {product.archivedAt ? "Prodotto archiviato" : "Archivia"}
          </p>
          <p className="mt-1 text-xs text-brown-800/60">
            {product.archivedAt
              ? `Archiviato il ${fmtDate(product.archivedAt)}: non compare nel catalogo né sul sito, ma storico, movimenti e righe d'ordine restano consultabili. Ripristinandolo torna attivo nel catalogo; vendita online ed evidenza restano da riattivare dalla scheda.`
              : "Sparisce dal catalogo, dai selettori e dal sito. Storico, movimenti e righe d'ordine restano: è la scelta giusta per qualsiasi cosa sia mai stata venduta."}
          </p>
          {!deletable && (
            <p className="mt-2 text-xs text-brown-800/60">
              Questo prodotto ha uno storico ({history.sold}{" "}
              {history.sold === 1 ? "riga d'ordine" : "righe d'ordine"}, {history.movements}{" "}
              {history.movements === 1 ? "movimento" : "movimenti"} di magazzino) e non può essere
              eliminato definitivamente.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ActionForm action={archiveProduct} className="inline-flex">
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="restore" value={product.archivedAt ? "true" : "false"} />
            <PendingButton
              tone="dark"
              confirm={
                product.archivedAt
                  ? undefined
                  : `Archiviare "${product.name}"? Sparisce dal catalogo e dal sito, ma storico e movimenti restano.`
              }
            >
              {product.archivedAt ? "Ripristina" : "Archivia"}
            </PendingButton>
          </ActionForm>
          {/* Offered only where it can succeed, like the delete on
              /admin/categories — the action itself refuses otherwise. */}
          {deletable && (
            <DeleteForm
              action={deleteProduct}
              id={product.id}
              redirectTo="/admin/products"
              confirm={`Eliminare definitivamente "${product.name}"? Non è mai stato venduto e non ha movimenti, quindi non si perde nessuno storico — ma l'operazione non è reversibile.`}
            />
          )}
        </div>
      </Panel>
    </div>
  );
}
