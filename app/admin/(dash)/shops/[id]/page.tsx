import { notFound } from "next/navigation";
import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { ShopForm } from "@/components/admin/forms";
import { adminGetShop } from "@/lib/admin/queries";
import { assertShopScope } from "@/lib/admin/scope";

export const dynamic = "force-dynamic";

export default async function EditShop({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await adminGetShop(id);
  if (!shop) notFound();
  // A shop row is a location, so its own slug is what the scope is measured
  // against — otherwise a scoped operator edits the other sede by URL.
  await assertShopScope(shop.slug);

  return (
    <div>
      <BackLink href="/admin/shops">Negozi</BackLink>
      <AdminHeader title={shop.name} subtitle={`Modifica sede · /${shop.slug}`} />
      <Panel>
        <ShopForm shop={shop} />
      </Panel>
    </div>
  );
}
