import Link from "next/link";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { ShopForm } from "@/components/admin/forms";
import { DeleteForm } from "@/components/admin/ActionForm";
import { adminGetShops } from "@/lib/admin/queries";
import { deleteShop } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

function ServiceTag({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase ${
        on ? "bg-emerald-100 text-emerald-800" : "bg-brown-900/10 text-brown-800/50"
      }`}
    >
      {label}
    </span>
  );
}

export default async function AdminShops() {
  const shops = await adminGetShops();

  return (
    <div>
      <AdminHeader title="Negozi" subtitle={`${shops.length} sedi · dati, orari, servizi`} />

      <details className="mb-6">
        <summary className="w-fit cursor-pointer rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase">
          + Nuova sede
        </summary>
        <Panel className="mt-4">
          <ShopForm />
        </Panel>
      </details>

      <div className="space-y-3">
        {shops.map((s) => (
          <Panel key={s.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-lg text-brown-950">
                {s.name} <span className="text-xs font-normal text-brown-800/50">/{s.slug}</span>
              </p>
              <p className="text-xs text-brown-800/60">{s.address}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ServiceTag on={s.reservationsEnabled} label="Prenotazioni" />
                <ServiceTag on={s.storeEnabled} label="Store" />
                <ServiceTag on={s.porchettaEnabled} label="Porchetta" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/shops/${s.id}`}
                className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
              >
                Modifica
              </Link>
              <DeleteForm
                action={deleteShop}
                id={s.id}
                confirm={`Eliminare la sede "${s.name}"? (Solo se non ha prodotti/ordini/prenotazioni.)`}
              />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
