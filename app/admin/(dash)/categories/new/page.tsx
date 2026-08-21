import { redirect } from "next/navigation";
import { AdminHeader, Panel, BackLink } from "@/components/admin/ui";
import { CategoryForm } from "@/components/admin/forms";
import { adminGetCategories } from "@/lib/admin/queries";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type SP = { searchParams: Promise<{ kind?: string }> };

export default async function NewCategory({ searchParams }: SP) {
  if (!(await isAdmin())) redirect("/admin");
  const { kind: raw } = await searchParams;
  const kind = raw === "post" ? "post" : "product";
  // Only top-level categories can be parents: the list renders one level of
  // nesting, and deeper trees would need a UI that earns its complexity first.
  const parents = (await adminGetCategories(kind)).filter((c) => !c.parentId);

  return (
    <div>
      <BackLink href={`/admin/categories${kind === "post" ? "?kind=post" : ""}`}>Categorie</BackLink>
      <AdminHeader
        title="Nuova categoria"
        subtitle={kind === "product" ? "Catalogo prodotti" : "News del sito"}
      />
      <Panel>
        <CategoryForm kind={kind} parents={parents} />
      </Panel>
    </div>
  );
}
