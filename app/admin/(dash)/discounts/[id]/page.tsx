import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { DiscountForm } from "@/components/admin/forms";
import { adminGetDiscount } from "@/lib/admin/queries";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function EditDiscount({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin");
  const { id } = await params;
  const discount = await adminGetDiscount(id);
  if (!discount) notFound();

  return (
    <div>
      <AdminHeader title={`Codice ${discount.code}`} subtitle="Modifica codice sconto" />
      <Link href="/admin/discounts" className="mb-4 inline-block text-sm text-brown-800/70 hover:text-brown-950">
        ← Torna ai codici sconto
      </Link>
      <Panel>
        <DiscountForm discount={discount} />
      </Panel>
    </div>
  );
}
