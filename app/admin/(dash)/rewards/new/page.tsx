import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { RewardForm } from "@/components/admin/forms";

export const dynamic = "force-dynamic";

export default function NewReward() {
  return (
    <div>
      <BackLink href="/admin/rewards">Premi</BackLink>
      <AdminHeader title="Nuovo premio" subtitle="Aggiungi un premio al catalogo fedeltà" />
      <Panel>
        <RewardForm />
      </Panel>
    </div>
  );
}
