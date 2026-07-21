import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { RewardForm } from "@/components/admin/forms";
import { adminGetReward } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function EditReward({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reward = await adminGetReward(id);
  if (!reward) notFound();

  return (
    <div>
      <AdminHeader title={`Premio · ${reward.name}`} subtitle="Modifica premio fedeltà" />
      <Link href="/admin/rewards" className="mb-4 inline-block text-sm text-brown-800/70 hover:text-brown-950">
        ← Torna ai premi
      </Link>
      <Panel>
        <RewardForm reward={reward} />
      </Panel>
    </div>
  );
}
