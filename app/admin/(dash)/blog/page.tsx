import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, fmtDate, NewButton, Pagination } from "@/components/admin/ui";
import {
  SegmentedFilter,
  FilterToolbar,
  ActiveFilters,
  chipsFrom,
  labelFrom,
} from "@/components/admin/FilterBar";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { getBlogPage } from "@/lib/admin/queries";
import { blogFilters } from "@/lib/admin/filters";
import { deleteBlogPost, toggleBlogPublished } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

const BASE = "/admin/blog";

const STATUS_CHIPS = [
  { value: "all", label: "Tutti" },
  { value: "pubblicati", label: "Pubblicati" },
  { value: "bozze", label: "Bozze" },
];

type SP = { searchParams: Promise<{ stato?: string; categoria?: string; q?: string; page?: string }> };

export default async function AdminBlog({ searchParams }: SP) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const filters = blogFilters(sp);
  const { rows: posts, total, pageCount, categories } = await getBlogPage({ ...filters, page });
  const filtered = Object.values(filters).some((v) => v && v !== "all");
  const CATEGORY_CHIPS = chipsFrom(categories, "Tutte le categorie");

  return (
    <div>
      <AdminHeader
        title="News"
        subtitle={`${total} articoli${filtered ? " nel filtro attuale" : ""}`}
        action={<NewButton href="/admin/blog/new">+ Nuovo articolo</NewButton>}
      />

      <SegmentedFilter
        basePath={BASE}
        params={filters}
        name="stato"
        options={STATUS_CHIPS}
        label="Filtra per stato di pubblicazione"
      />
      <FilterToolbar
        basePath={BASE}
        params={filters}
        searchPlaceholder="Titolo, slug o estratto…"
        carry={["stato"]}
        formId="blog-filters"
        facets={[{ name: "categoria", label: "Categoria", options: CATEGORY_CHIPS }]}
      />
      <ActiveFilters
        basePath={BASE}
        params={filters}
        labels={{
          stato: { title: "Stato", format: labelFrom(STATUS_CHIPS) },
          categoria: { title: "Categoria" },
          q: { title: "Ricerca", format: (v) => `“${v}”` },
        }}
      />

      {posts.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            {filtered
              ? "Nessun articolo corrisponde ai filtri."
              : "Nessun articolo ancora. Scrivine uno con «Nuovo articolo»."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Panel key={p.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-display text-lg text-brown-950">{p.title}</p>
                  <p className="text-xs text-brown-800/60">
                    {p.category} · {fmtDate(p.date)}
                  </p>
                </div>
                {!p.published && <StatusBadge status="pending" />}
              </div>
              <div className="flex items-center gap-2">
                <ActionForm action={toggleBlogPublished} className="inline-flex">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="published" value={p.published ? "false" : "true"} />
                  <PendingButton tone="dark">{p.published ? "Nascondi" : "Pubblica"}</PendingButton>
                </ActionForm>
                <Link
                  href={`/admin/blog/${p.id}`}
                  className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                >
                  Modifica
                </Link>
                <DeleteForm action={deleteBlogPost} id={p.id} confirm={`Eliminare "${p.title}"?`} />
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={filters} />
    </div>
  );
}
