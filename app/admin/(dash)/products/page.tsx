import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, euro } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/forms";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { adminGetProducts, adminGetShops } from "@/lib/admin/queries";
import { getSetting } from "@/lib/db/queries";
import { deleteProduct, toggleProductActive, toggleProductFeatured } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminProducts() {
  const [products, shops, lowStockThreshold] = await Promise.all([
    adminGetProducts(),
    adminGetShops(),
    getSetting<number>("store.lowStockThreshold", 5),
  ]);

  return (
    <div>
      <AdminHeader title="Prodotti" subtitle={`${products.length} prodotti`} />

      <details className="mb-6">
        <summary className="cursor-pointer rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase w-fit">
          + Nuovo prodotto
        </summary>
        <Panel className="mt-4">
          <ProductForm shops={shops} />
        </Panel>
      </details>

      {products.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun prodotto ancora. Aggiungine uno con il pulsante qui sopra.</p>
        </Panel>
      ) : (
      <div className="space-y-3">
        {products.map((p) => (
          <Panel key={p.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div>
                <p className="font-display text-lg text-brown-950">{p.name}</p>
                <p className="text-xs text-brown-800/60">
                  {p.category} · {p.shopSlug} · {euro(p.priceCents)}
                  {p.unit ? ` / ${p.unit}` : ""}
                </p>
              </div>
              {!p.active && <StatusBadge status="cancelled" />}
              {p.purchasable && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold tracking-widest text-emerald-800 uppercase">
                  Shop
                </span>
              )}
              {/* Stock indicator — only for products that track stock (stock not null;
                  null = illimitato/su ordinazione). Red "Scorte basse" at/under the
                  configured threshold, neutral count otherwise. */}
              {p.stock != null &&
                (p.stock <= lowStockThreshold ? (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-bold tracking-widest text-red-700 uppercase">
                    Scorte basse · {p.stock}
                  </span>
                ) : (
                  <span className="rounded-full bg-brown-900/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-brown-800 uppercase">
                    {p.stock} in magazzino
                  </span>
                ))}
            </div>
            <div className="flex items-center gap-2">
              <ActionForm action={toggleProductFeatured} className="inline-flex">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="featured" value={p.featured ? "false" : "true"} />
                <PendingButton tone={p.featured ? "gold" : "dark"}>
                  {p.featured ? "★ In evidenza" : "☆ Evidenzia"}
                </PendingButton>
              </ActionForm>
              <ActionForm action={toggleProductActive} className="inline-flex">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="active" value={p.active ? "false" : "true"} />
                <PendingButton tone="dark">{p.active ? "Disattiva" : "Attiva"}</PendingButton>
              </ActionForm>
              <Link
                href={`/admin/products/${p.id}`}
                className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
              >
                Modifica
              </Link>
              <DeleteForm action={deleteProduct} id={p.id} confirm={`Eliminare "${p.name}"?`} />
            </div>
          </Panel>
        ))}
      </div>
      )}
    </div>
  );
}
