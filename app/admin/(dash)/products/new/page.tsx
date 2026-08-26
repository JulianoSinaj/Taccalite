import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/forms";
import { adminGetShops, adminGetCategories } from "@/lib/admin/queries";
import { shopScope } from "@/lib/admin/scope";

export const dynamic = "force-dynamic";

export default async function NewProduct() {
  const [shops, categories, scope] = await Promise.all([
    adminGetShops(),
    adminGetCategories("product"),
    shopScope(),
  ]);
  return (
    <div>
      <BackLink href="/admin/products">Prodotti</BackLink>
      <AdminHeader title="Nuovo prodotto" subtitle="Aggiungi un articolo al catalogo" />
      <Panel>
        {/* An operator confined to one location is offered that location only —
            the action refuses any other, and a select full of choices that all
            fail on submit is not a choice. */}
        <ProductForm shops={shops.filter((s) => !scope || s.slug === scope)} categories={categories} />
      </Panel>
    </div>
  );
}
