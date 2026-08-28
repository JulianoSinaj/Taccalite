import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, NewButton, inputCls, labelCls } from "@/components/admin/ui";
import { FilterToolbar } from "@/components/admin/FilterBar";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import CategoryOrderList from "@/components/admin/CategoryOrderList";
import { adminGetCategoriesWithUsage, countUnfiled, type CategoryWithUsage } from "@/lib/admin/queries";
import { mergeCategories } from "@/lib/admin/category-actions";
import { KINDS, countOf, type Kind } from "@/lib/admin/category-kinds";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const BASE = "/admin/categories";

type SP = { searchParams: Promise<{ kind?: string; q?: string }> };

const listHref = (kind: Kind) => (kind === "product" ? BASE : `${BASE}?kind=${kind}`);

/* ----------------------------------------------------------------------------
 * Ordering and search
 * ------------------------------------------------------------------------- */

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

/** Children grouped by parent id, in the order the query returned them. */
function childrenByParent(rows: CategoryWithUsage[]): Map<string, CategoryWithUsage[]> {
  const byParent = new Map<string, CategoryWithUsage[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
  }
  return byParent;
}

/** Parents first, each followed by its children — the order the picker shows. */
function tree(rows: CategoryWithUsage[]): CategoryWithUsage[] {
  const byParent = childrenByParent(rows);
  const out: CategoryWithUsage[] = [];
  for (const root of rows.filter((r) => !r.parentId)) {
    out.push(root, ...(byParent.get(root.id) ?? []));
  }
  // A child whose parent was filtered out (or, in old data, nested deeper than
  // the one level allowed) would otherwise vanish.
  for (const r of rows) if (!out.includes(r)) out.push(r);
  return out;
}

/**
 * Where each row sits among its siblings, computed on the *unfiltered* list so
 * the ↑ ↓ arrows mean the same thing whether or not a search is active. A plain
 * object (not a `Map`) because this crosses into the client component below.
 */
function positions(all: CategoryWithUsage[]): Record<string, { first: boolean; last: boolean }> {
  const groups = [all.filter((r) => !r.parentId), ...childrenByParent(all).values()];
  const out: Record<string, { first: boolean; last: boolean }> = {};
  for (const g of groups) {
    g.forEach((r, i) => (out[r.id] = { first: i === 0, last: i === g.length - 1 }));
  }
  return out;
}

/* ----------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

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
  const pos = positions(all);
  const children = childrenByParent(all);
  const childCounts = Object.fromEntries(all.filter((c) => !c.parentId).map((c) => [c.id, children.get(c.id)?.length ?? 0]));
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
            : `${all.length} categorie · ${active.label.toLowerCase()}`
        }
        action={<NewButton href={`${BASE}/new?kind=${kind}`}>+ Nuova categoria</NewButton>}
      />

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Tipo di categoria">
        {KINDS.map((k) => (
          <Link
            key={k.value}
            href={listHref(k.value)}
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

      {/* The same toolbar every other list uses — this page was the last one
          still on a bare, unlabelled search box, so it had no field label, no
          apply-on-change and none of the shared chrome around it.

          `kind` rides along as a carried hidden field: searching from the News
          tab must not silently drop the operator back into the product
          vocabulary. */}
      <FilterToolbar
        basePath={BASE}
        params={{ kind, ...(q ? { q } : {}) }}
        carry={["kind"]}
        formId="categories-filters"
        searchPlaceholder="Nome o slug…"
      />
      {q && (
        <p className="-mt-2 mb-4 text-xs">
          <Link href={listHref(kind)} className="font-semibold text-gold-deep underline">
            Azzera la ricerca
          </Link>
        </p>
      )}

      {unfiled > 0 && (
        <Panel className="mb-4 border-warn/30 bg-warn-soft">
          <p className="text-sm text-warn-soft-fg">
            <strong className="font-semibold">{countOf(unfiled, active)}</strong>{" "}
            {unfiled === 1 ? "ha" : "hanno"} una categoria scritta a mano che non corrisponde a
            nessuna voce di questo elenco.{" "}
            <Link href={`${active.listHref}?categoria=non-assegnata`} className="font-semibold underline">
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
                <Link href={listHref(kind)} className="font-semibold text-gold-deep underline">
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
        <CategoryOrderList kind={active} rows={ordered} childCounts={childCounts} positions={pos} searching={!!q} />
      )}

      {all.length > 1 && <MergePanel rows={allOrdered} />}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Merge
 * ------------------------------------------------------------------------- */

function MergePanel({ rows }: { rows: CategoryWithUsage[] }) {
  const option = (c: CategoryWithUsage) => (
    <option key={c.id} value={c.id}>
      {c.parentId ? "↳ " : ""}
      {c.name} ({c.usage})
    </option>
  );

  return (
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
            {rows.map(option)}
          </select>
        </div>
        <div className="flex-1">
          <label className={labelCls} htmlFor="merge-target">
            A (riceve tutto)
          </label>
          {/* Starts on the second row so the two pickers never begin equal —
              submitting the untouched form used to fail on "scegli due
              categorie diverse". */}
          <select id="merge-target" name="targetId" className={inputCls} required defaultValue={rows[1]?.id}>
            {rows.map(option)}
          </select>
        </div>
        <PendingButton tone="dark" confirm="Unire le due categorie? La prima verrà eliminata.">
          Unisci
        </PendingButton>
      </ActionForm>
    </Panel>
  );
}
