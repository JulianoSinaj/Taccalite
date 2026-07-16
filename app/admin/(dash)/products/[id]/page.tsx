import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/forms";
import { adminGetProduct, adminGetShops } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, shops] = await Promise.all([adminGetProduct(id), adminGetShops()]);
  if (!product) notFound();

  return (
    <div>
      <Link href="/admin/products" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-brown-800/70 hover:text-brown-950">
        <ArrowLeft className="size-4" /> Prodotti
      </Link>
      <AdminHeader title={product.name} subtitle="Modifica prodotto" />
      <Panel>
        <ProductForm product={product} shops={shops} />
      </Panel>
    </div>
  );
}
