import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminHeader, Panel, inputCls, labelCls, fmtDate } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { ProductForm } from "@/components/admin/forms";
import { adminGetProduct, adminGetShops, getStockMovements } from "@/lib/admin/queries";
import { adjustStock } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, shops] = await Promise.all([adminGetProduct(id), adminGetShops()]);
  if (!product) notFound();

  const movements = product.stock != null ? await getStockMovements(product.id) : [];

  return (
    <div>
      <Link href="/admin/products" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-brown-800/70 hover:text-brown-950">
        <ArrowLeft className="size-4" /> Prodotti
      </Link>
      <AdminHeader title={product.name} subtitle="Modifica prodotto" />
      <Panel>
        <ProductForm product={product} shops={shops} />
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
          </p>
          <ActionForm action={adjustStock} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="productId" value={product.id} />
            <div>
              <label className={labelCls} htmlFor="delta">Variazione</label>
              <input id="delta" name="delta" type="number" placeholder="es. +10 o -3" required className={`${inputCls} w-32`} />
            </div>
            <div className="min-w-48 flex-1">
              <label className={labelCls} htmlFor="reason">Motivo</label>
              <input id="reason" name="reason" placeholder="es. Carico fornitore, scarto, inventario" className={inputCls} />
            </div>
            <PendingButton tone="dark">Applica</PendingButton>
          </ActionForm>
          <p className="mt-3 text-xs text-brown-800/60">
            Positivo per caricare (arrivo merce), negativo per scaricare (scarto, correzione inventario).
          </p>

          {movements.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brown-900/10 text-left text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">
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
                      <td className={`py-2 text-right font-bold tabular-nums ${m.delta >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {m.delta >= 0 ? `+${m.delta}` : m.delta}
                      </td>
                      <td className="py-2 text-right tabular-nums text-brown-950">{m.stockAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
