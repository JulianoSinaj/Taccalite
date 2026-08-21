import { notFound, redirect } from "next/navigation";
import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { CategoryForm } from "@/components/admin/forms";
import { adminGetCategory, adminGetCategories } from "@/lib/admin/queries";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function EditCategory({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin");
  const { id } = await params;
  const category = await adminGetCategory(id);
  if (!category) notFound();

  // A category cannot parent itself, and its own children cannot become its
  // parent — that would make a cycle the list rendering can't unwind.
  const parents = (await adminGetCategories(category.kind)).filter(
    (c) => !c.parentId && c.id !== category.id,
  );

  return (
    <div>
      <BackLink href={`/admin/categories${category.kind === "post" ? "?kind=post" : ""}`}>
        Categorie
      </BackLink>
      <AdminHeader
        title={category.name}
        subtitle={category.kind === "product" ? "Catalogo prodotti" : "News del sito"}
      />
      <Panel>
        <CategoryForm category={category} parents={parents} />
      </Panel>
      <p className="mt-4 text-xs text-brown-800/60">
        Rinominando la categoria il nuovo nome viene applicato a tutti gli elementi che la usano.
      </p>
    </div>
  );
}
