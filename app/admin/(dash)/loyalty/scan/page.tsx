import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/ui";
import { ScanForm } from "@/components/admin/ScanForm";
import { getSetting } from "@/lib/db/queries";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLoyaltyScan() {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin/login");
  }

  // Passed in so the form can preview the points before anything is credited.
  const pointsPerEuro = await getSetting<number>("loyalty.pointsPerEuro", 1);

  return (
    <div>
      <AdminHeader
        title="Punti in negozio"
        subtitle="Accredita i punti fedeltà per un acquisto al banco"
      />
      <ScanForm pointsPerEuro={pointsPerEuro || 1} />
    </div>
  );
}
