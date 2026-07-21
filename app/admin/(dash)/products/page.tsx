import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, euro } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/forms";
import { DeleteForm } from "@/components/admin/ActionForm";
import { adminGetProducts, adminGetShops } from "@/lib/admin/queries";
import { deleteProduct } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminProducts() {
  const [products, shops] = await Promise.all([adminGetProducts(), adminGetShops()]);

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
            </div>
            <div className="flex items-center gap-2">
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
    </div>
  );
}
