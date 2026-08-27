import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminHeader, Panel, BackLink, HistoryLink } from "@/components/admin/ui";
import { RewardForm } from "@/components/admin/forms";
import { adminGetReward, adminGetRewardStats } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function EditReward({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [reward, stats] = await Promise.all([adminGetReward(id), adminGetRewardStats(id)]);
  if (!reward) notFound();

  const redemptionsHref = `/admin/loyalty?rq=${encodeURIComponent(reward.name)}&rstato=`;
  const stat = (label: string, n: number, stato: string) => (
    <Link
      href={redemptionsHref + stato}
      className="rounded-xl bg-brown-900/5 px-4 py-3 hover:bg-brown-900/10"
    >
      <p className="font-display text-2xl text-brown-950">{n}</p>
      <p className="text-xs font-bold tracking-widest text-brown-800/60 uppercase">{label}</p>
    </Link>
  );

  return (
    <div>
      <BackLink href="/admin/rewards">Premi</BackLink>
      <AdminHeader
        title={`Premio · ${reward.name}`}
        subtitle="Modifica premio fedeltà"
        action={<HistoryLink id={reward.id} />}
      />
      {/* Every number here is a link into the redemptions list filtered on this
          reward: pending ones are what the shop still owes a customer. */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {stat("Da consegnare", stats.pending, "pending")}
        {stat("Consegnati", stats.fulfilled, "fulfilled")}
        {stat("Annullati", stats.cancelled, "cancelled")}
      </div>
      <Panel>
        <RewardForm reward={reward} />
      </Panel>
    </div>
  );
}
