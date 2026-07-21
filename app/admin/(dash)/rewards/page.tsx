import Link from "next/link";
import { AdminHeader, Panel, StatusBadge } from "@/components/admin/ui";
import { RewardForm } from "@/components/admin/forms";
import { DeleteForm } from "@/components/admin/ActionForm";
import { adminGetRewards } from "@/lib/admin/queries";
import { deleteReward } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminRewards() {
  const rewards = await adminGetRewards();

  return (
    <div>
      <AdminHeader title="Premi" subtitle={`${rewards.length} premi nel catalogo fedeltà`} />

      <details className="mb-6">
        <summary className="w-fit cursor-pointer rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase">
          + Nuovo premio
        </summary>
        <Panel className="mt-4">
          <RewardForm />
        </Panel>
      </details>

      {rewards.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun premio ancora. Creane uno qui sopra.</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {rewards.map((r) => (
            <Panel key={r.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-display text-lg text-brown-950">{r.name}</p>
                  <p className="text-xs text-brown-800/60">
                    {r.points} punti{r.description ? ` · ${r.description}` : ""}
                  </p>
                </div>
                {!r.active && <StatusBadge status="cancelled" />}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/rewards/${r.id}`}
                  className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                >
                  Modifica
                </Link>
                <DeleteForm action={deleteReward} id={r.id} confirm={`Eliminare "${r.name}"?`} />
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
