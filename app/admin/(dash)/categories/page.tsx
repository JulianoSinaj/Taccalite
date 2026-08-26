import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, StatusBadge, NewButton, SearchBox, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { adminGetCategoriesWithUsage, countUnfiled, type CategoryWithUsage } from "@/lib/admin/queries";
import { toggleCategoryActive, deleteCategory, mergeCategories } from "@/lib/admin/category-actions";
import { isAdmin } from "@/lib/auth/session";
import { vatRateLabel } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

const BASE = "/admin/categories";

const KINDS = [
  { value: "product", label: "Prodotti", noun: "prodotti", href: "/admin/products" },
  { value: "post", label: "News", noun: "articoli", href: "/admin/blog" },
] as const;

type Kind = (typeof KINDS)[number]["value"];
type SP = { searchParams: Promise<{ kind?: string; q?: string }> };

/**
 * Name/slug search over one vocabulary.
 *
 * A child is kept when its *parent* matches, so searching "Salumi" returns the
 * branch rather than the one row that happens to carry the word — the list is a
 * tree and a lone subcategory out of context is not a useful answer. `tree()`
 * already tolerates the reverse case (a match whose parent was filtered away).
 */
function search(rows: CategoryWithUsage[], q: string): CategoryWithUsage[] {
  const needle = q.toLowerCase();
  const hit = (r: CategoryWithUsage) =>
    r.name.toLowerCase().includes(needle) || r.slug.toLowerCase().includes(needle);
  const matchedIds = new Set(rows.filter(hit).map((r) => r.id));
  return rows.filter((r) => hit(r) || (r.parentId && matchedIds.has(r.parentId)));
}

/** Parents first, each followed by its children — the order the picker shows. */
function tree(rows: CategoryWithUsage[]): CategoryWithUsage[] {
  const roots = rows.filter((r) => !r.parentId);
  const byParent = new Map<string, CategoryWithUsage[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const list = byParent.get(r.parentId) ?? [];
    list.push(r);
    byParent.set(r.parentId, list);
  }
  const out: CategoryWithUsage[] = [];
  for (const root of roots) {
    out.push(root);
    out.push(...(byParent.get(root.id) ?? []));
  }
  // A child whose parent was filtered out of this kind would otherwise vanish.
  for (const r of rows) if (!out.includes(r)) out.push(r);
  return out;
}

export default async function AdminCategories({ searchParams }: SP) {
  // Taxonomy decides VAT defaults and public URLs — admin-only, like the
  // catalogue settings it feeds.
  if (!(await isAdmin())) redirect("/admin");

  const sp = await searchParams;
  const kind: Kind = sp.kind === "post" ? "post" : "product";
  const active = KINDS.find((k) => k.value === kind)!;
  const q = sp.q?.trim() ?? "";

  const [all, unfiled] = await Promise.all([
    adminGetCategoriesWithUsage(kind),
    countUnfiled(kind),
  ]);
  // Filtered in memory: one vocabulary is tens of rows, already fetched whole to
  // build the tree, and the merge picker below needs the unfiltered list anyway.
  const rows = q ? search(all, q) : all;
  const ordered = tree(rows);
  // The merge picker deliberately ignores the search: reconciling a doubled-up
  // vocabulary means choosing between two rows that, by definition, are spelled
  // differently — a filter narrow enough to surface the typo would usually hide
  // the category it should be merged into.
  const allOrdered = q ? tree(all) : ordered;

  return (
    <div>
      <AdminHeader
        title="Categorie"
        subtitle={
          q
            ? `${rows.length} di ${all.length} categorie · ${active.label.toLowerCase()} · “${q}”`
            : `${rows.length} categorie · ${active.label.toLowerCase()}`
        }
        action={<NewButton href={`${BASE}/new?kind=${kind}`}>+ Nuova categoria</NewButton>}
      />

      {/* The two vocabularies are separate lists on purpose: the shop files
          products under "Formaggi" and posts under "Formaggi" too, and they are
          not the same thing. */}
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Tipo di categoria">
        {KINDS.map((k) => (
          <Link
            key={k.value}
            href={k.value === "product" ? BASE : `${BASE}?kind=${k.value}`}
            aria-current={k.value === kind ? "true" : undefined}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              k.value === kind
                ? "bg-brown-950 text-cream"
                : "bg-brown-900/10 text-brown-950 hover:bg-brown-900/15"
            }`}
          >
            {k.label}
          </Link>
        ))}
      </div>

      {/* `kind` rides along as a hidden field: searching from the News tab must
          not silently drop the operator back into the product vocabulary. */}
      <SearchBox
        basePath={BASE}
        q={q}
        placeholder="Cerca per nome o slug…"
        hidden={kind === "product" ? {} : { kind }}
      />

      {unfiled > 0 && (
        <Panel className="mb-4 border-warn/30 bg-warn-soft">
          <p className="text-sm text-warn-soft-fg">
            <strong className="font-semibold">{unfiled}</strong>{" "}
            {unfiled === 1 ? `${active.noun.slice(0, -1)} ha` : `${active.noun} hanno`} una categoria
            scritta a mano che non corrisponde a nessuna voce di questo elenco.{" "}
            <Link
              href={
                kind === "product"
                  ? "/admin/products?categoria=non-assegnata"
                  : `${active.href}?categoria=non-assegnata`
              }
              className="font-semibold underline"
            >
              Aprili tutti
            </Link>{" "}
            e riassegnali, oppure crea qui la categoria mancante con lo stesso nome.
          </p>
        </Panel>
      )}

      {rows.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            {q ? (
              <>
                Nessuna categoria corrisponde a «{q}».{" "}
                <Link
                  href={kind === "product" ? BASE : `${BASE}?kind=${kind}`}
                  className="font-semibold text-gold-deep underline"
                >
                  Azzera la ricerca
                </Link>
                .
              </>
            ) : (
              "Nessuna categoria. Creane una con «Nuova categoria»."
            )}
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {ordered.map((c) => (
            <Panel
              key={c.id}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-display text-lg text-brown-950">
                    {c.parentId && <span className="text-brown-800/40">↳ </span>}
                    {c.name}
                  </p>
                  <p className="text-xs text-brown-800/60">
                    <code>/{c.slug}</code> · {c.usage} {c.usage === 1 ? active.noun.slice(0, -1) : active.noun}
                    {c.defaultVatRateBps != null && ` · IVA ${vatRateLabel(c.defaultVatRateBps)}`}
                  </p>
                </div>
                {!c.active && <StatusBadge status="cancelled" />}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ActionForm action={toggleCategoryActive} className="inline-flex">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                  <PendingButton tone="dark">{c.active ? "Nascondi" : "Mostra"}</PendingButton>
                </ActionForm>
                <Link
                  href={`${BASE}/${c.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                >
                  Modifica
                </Link>
                {/* Deleting a category in use is refused by the foreign key
                    itself. Hiding the button when it cannot succeed keeps the
                    list honest — the merge tool below is the way out. */}
                {c.usage === 0 && (
                  <DeleteForm
                    action={deleteCategory}
                    id={c.id}
                    confirm={`Eliminare la categoria "${c.name}"?`}
                  />
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {all.length > 1 && (
        <Panel className="mt-8">
          <h2 className="font-display mb-1 text-lg text-brown-950">Unisci due categorie</h2>
          <p className="mb-4 text-sm text-brown-800/70">
            Sposta tutto ciò che è archiviato nella prima categoria dentro la seconda, poi elimina
            la prima. Serve a rimediare a un doppione — per esempio «Formaggio» creato per errore
            accanto a «Formaggi».
          </p>
          <ActionForm action={mergeCategories} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className={labelCls} htmlFor="merge-source">
                Da (viene eliminata)
              </label>
              <select id="merge-source" name="sourceId" className={inputCls} required>
                {allOrdered.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.usage})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className={labelCls} htmlFor="merge-target">
                A (riceve tutto)
              </label>
              <select id="merge-target" name="targetId" className={inputCls} required>
                {allOrdered.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.usage})
                  </option>
                ))}
              </select>
            </div>
            <PendingButton tone="dark" confirm="Unire le due categorie? La prima verrà eliminata.">
              Unisci
            </PendingButton>
          </ActionForm>
        </Panel>
      )}
    </div>
  );
}
