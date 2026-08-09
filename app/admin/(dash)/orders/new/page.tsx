import { AdminHeader, BackLink } from "@/components/admin/ui";
import { ManualOrderForm } from "@/components/admin/ManualOrderForm";
import { adminGetProducts, adminGetShops } from "@/lib/admin/queries";
import { getSetting } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function NewManualOrder() {
  const [products, shops, shippingCents, freeShippingThresholdCents] = await Promise.all([
    adminGetProducts(),
    adminGetShops(),
    getSetting<number>("store.shippingCents", 700),
    getSetting<number>("store.freeShippingThresholdCents", 0),
  ]);

  return (
    <div>
      <BackLink href="/admin/orders">Ordini</BackLink>
      <AdminHeader title="Nuovo ordine" subtitle="Registra una vendita al banco o telefonica" />
      <ManualOrderForm
        products={products}
        shops={shops}
        pricing={{ shippingCents, freeShippingThresholdCents }}
      />
    </div>
  );
}
