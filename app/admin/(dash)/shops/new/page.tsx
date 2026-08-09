import { redirect } from "next/navigation";
import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { ShopForm } from "@/components/admin/forms";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewShop() {
  // Creating a location is admin-only (staff may edit an existing one).
  if (!(await isAdmin())) redirect("/admin/shops");
  return (
    <div>
      <BackLink href="/admin/shops">Negozi</BackLink>
      <AdminHeader title="Nuova sede" subtitle="Dati, orari e servizi di un punto vendita" />
      <Panel>
        <ShopForm />
      </Panel>
    </div>
  );
}
