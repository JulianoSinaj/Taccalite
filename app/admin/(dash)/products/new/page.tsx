import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/forms";
import { adminGetShops, getCategoryVatDefaults } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function NewProduct() {
  const [shops, categoryVat] = await Promise.all([adminGetShops(), getCategoryVatDefaults()]);
  return (
    <div>
      <BackLink href="/admin/products">Prodotti</BackLink>
      <AdminHeader title="Nuovo prodotto" subtitle="Aggiungi un articolo al catalogo" />
      <Panel>
        <ProductForm shops={shops} categoryVat={categoryVat} />
      </Panel>
    </div>
  );
}
