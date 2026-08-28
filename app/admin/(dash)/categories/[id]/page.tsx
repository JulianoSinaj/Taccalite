import Link from "next/link";
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

  const siblings = await adminGetCategories(category.kind);
  // A category cannot parent itself, and only top-level rows can be parents —
  // one level of nesting is all the list draws.
  const parents = siblings.filter((c) => !c.parentId && c.id !== category.id);
  // …and a row that already groups others must stay top level (the server
  // refuses otherwise; the form hides the field so it cannot be tried).
  const hasChildren = siblings.some((c) => c.parentId === category.id);
  const listHref = `/admin/categories${category.kind === "post" ? "?kind=post" : ""}`;
  // The public page 404s on a hidden category, so the link is only offered
  // when it would open.
  const liveOnSite = category.kind === "product" && category.active;

  return (
    <div>
      <BackLink href={listHref}>Categorie</BackLink>
      <AdminHeader
        title={category.name}
        subtitle={category.kind === "product" ? "Catalogo prodotti" : "News del sito"}
        action={
          liveOnSite ? (
            <Link
              href={`/negozio/categoria/${category.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Vedi sul sito ↗
            </Link>
          ) : undefined
        }
      />
      <Panel>
        <CategoryForm category={category} parents={parents} hasChildren={hasChildren} />
      </Panel>
      <p className="mt-4 text-xs text-brown-800/70">
        Rinominando la categoria il nuovo nome viene applicato a tutti gli elementi che la usano.
      </p>
    </div>
  );
}
