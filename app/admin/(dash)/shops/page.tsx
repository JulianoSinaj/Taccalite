import Link from "next/link";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { adminGetShops } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function AdminShops() {
  const shops = await adminGetShops();

  return (
    <div>
      <AdminHeader title="Negozi" subtitle="Modifica dati, orari e contenuti delle botteghe" />
      <div className="space-y-3">
        {shops.map((s) => (
          <Panel key={s.id} className="flex items-center justify-between">
            <div>
              <p className="font-display text-lg text-brown-950">{s.name}</p>
              <p className="text-xs text-brown-800/60">{s.address}</p>
            </div>
            <Link
              href={`/admin/shops/${s.id}`}
              className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Modifica
            </Link>
          </Panel>
        ))}
      </div>
    </div>
  );
}
