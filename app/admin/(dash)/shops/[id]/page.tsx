import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { ShopForm } from "@/components/admin/forms";
import { adminGetShop } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function EditShop({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shop = await adminGetShop(id);
  if (!shop) notFound();

  return (
    <div>
      <Link href="/admin/shops" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-brown-800/70 hover:text-brown-950">
        <ArrowLeft className="size-4" /> Negozi
      </Link>
      <AdminHeader title={shop.name} subtitle="Modifica negozio" />
      <Panel>
        <ShopForm shop={shop} />
      </Panel>
    </div>
  );
}
