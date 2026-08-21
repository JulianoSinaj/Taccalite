import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/forms";
import { adminGetShops, adminGetCategories } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function NewProduct() {
  const [shops, categories] = await Promise.all([adminGetShops(), adminGetCategories("product")]);
  return (
    <div>
      <BackLink href="/admin/products">Prodotti</BackLink>
      <AdminHeader title="Nuovo prodotto" subtitle="Aggiungi un articolo al catalogo" />
      <Panel>
        <ProductForm shops={shops} categories={categories} />
      </Panel>
    </div>
  );
}
