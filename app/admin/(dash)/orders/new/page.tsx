import Link from "next/link";
import { AdminHeader, Panel, inputCls, labelCls, euro } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { adminGetProducts, adminGetShops } from "@/lib/admin/queries";
import { createManualOrder } from "@/lib/admin/order-actions";
import { vatRateLabel } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

export default async function NewManualOrder() {
  const [products, shops] = await Promise.all([adminGetProducts(), adminGetShops()]);
  // Only sellable products (active + priced) can go on a manual order.
  const sellable = products.filter((p) => p.active && p.priceCents != null);

  return (
    <div>
      <Link href="/admin/orders" className="mb-4 inline-block text-sm text-brown-800/70 hover:text-brown-950">
        ← Torna agli ordini
      </Link>
      <AdminHeader title="Nuovo ordine" subtitle="Registra una vendita al banco o telefonica" />

      <ActionForm action={createManualOrder} className="space-y-6">
        {/* Products */}
        <Panel>
          <h3 className="font-display mb-4 text-lg text-brown-950">Prodotti</h3>
          {sellable.length === 0 ? (
            <p className="text-sm text-brown-800/70">Nessun prodotto vendibile. Aggiungi un prezzo ai prodotti.</p>
          ) : (
            <div className="divide-y divide-brown-900/10">
              {sellable.map((p) => (
                <div key={p.id} className="flex items-center gap-4 py-2">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-brown-950">{p.name}</p>
                    <p className="text-xs text-brown-800/60">
                      {euro(p.priceCents)}
                      {p.unit ? ` / ${p.unit}` : ""} · IVA {vatRateLabel(p.vatRateBps)}
                      {p.stock != null ? ` · giacenza ${p.stock}` : ""}
                    </p>
                  </div>
                  <input
                    type="number"
                    name={`qty_${p.slug}`}
                    min={0}
                    defaultValue={0}
                    className={`${inputCls} w-24`}
                    aria-label={`Quantità ${p.name}`}
                  />
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-brown-800/60">
            Prezzi e IVA sono presi dall&apos;anagrafica. Imposta la quantità dei prodotti da includere.
          </p>
        </Panel>

        {/* Customer */}
        <Panel>
          <h3 className="font-display mb-4 text-lg text-brown-950">Cliente</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Nome</label>
              <input name="name" required placeholder="es. Cliente al banco" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Telefono</label>
              <input name="phone" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Email (opzionale)</label>
              <input name="email" type="email" className={inputCls} />
            </div>
          </div>
        </Panel>

        {/* Fulfilment + payment */}
        <Panel>
          <h3 className="font-display mb-4 text-lg text-brown-950">Evasione e pagamento</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Tipo</label>
              <select name="fulfilment" defaultValue="pickup" className={inputCls}>
                <option value="pickup">Ritiro in negozio</option>
                <option value="shipping">Spedizione</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Negozio (per ritiro)</label>
              <select name="shopSlug" defaultValue={shops[0]?.slug} className={inputCls}>
                {shops.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Indirizzo (per spedizione)</label>
              <input name="address" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Città</label>
              <input name="city" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>CAP</label>
              <input name="zip" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Codice sconto (opzionale)</label>
              <input name="discountCode" className={`${inputCls} uppercase`} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Note</label>
              <textarea name="notes" rows={2} className={inputCls} />
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-medium text-brown-900">
            <input type="checkbox" name="markPaid" className="h-4 w-4 rounded accent-brown-950" />
            Segna come pagato (vendita al banco) — scala la giacenza
          </label>
        </Panel>

        <PendingButton>Crea ordine</PendingButton>
      </ActionForm>
    </div>
  );
}
