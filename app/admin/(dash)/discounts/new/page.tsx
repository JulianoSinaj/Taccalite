import { redirect } from "next/navigation";
import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { DiscountForm } from "@/components/admin/forms";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewDiscount() {
  // Coupons move money — admin only.
  if (!(await isAdmin())) redirect("/admin");
  return (
    <div>
      <BackLink href="/admin/discounts">Codici sconto</BackLink>
      <AdminHeader title="Nuovo codice sconto" subtitle="Percentuale, importo fisso o spedizione gratuita" />
      <Panel>
        <DiscountForm />
      </Panel>
    </div>
  );
}
