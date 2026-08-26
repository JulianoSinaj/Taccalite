import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, StatusBadge, NewButton, SearchBox, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { adminGetCategoriesWithUsage, countUnfiled, type CategoryWithUsage } from "@/lib/admin/queries";
import {
  toggleCategoryActive,
  deleteCategory,
  mergeCategories,
  moveCategory,
} from "@/lib/admin/category-actions";
import { isAdmin } from "@/lib/auth/session";
import { vatRateLabel } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

const BASE = "/admin/categories";

/* ----------------------------------------------------------------------------
 * The two vocabularies
 *
 * Separate lists on purpose: the shop files products under "Formaggi" and posts
 * under "Formaggi" too, and they are not the same thing. Product categories are
 * pages on the storefront; news categories are a label on the article.
 * ------------------------------------------------------------------------- */

const KINDS = [
  { value: "product", label: "Prodotti", one: "prodotto", many: "prodotti", listHref: "/admin/products" },
  { value: "post", label: "News", one: "articolo", many: "articoli", listHref: "/admin/blog" },
] as const;

type KindMeta = (typeof KINDS)[number];
type Kind = KindMeta["value"];
type SP = { searchParams: Promise<{ kind?: string; q?: string }> };

const listHref = (kind: Kind) => (kind === "product" ? BASE : `${BASE}?kind=${kind}`);
const countOf = (n: number, k: KindMeta) => `${n} ${n === 1 ? k.one : k.many}`;

const pillCls =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15";

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
 * the ↑ ↓ arrows mean the same thing whether or not a search is active.
 */
function positions(all: CategoryWithUsage[]): Map<string, { first: boolean; last: boolean }> {
  const groups = [all.filter((r) => !r.parentId), ...childrenByParent(all).values()];
  const out = new Map<string, { first: boolean; last: boolean }>();
  for (const g of groups) {
    g.forEach((r, i) => out.set(r.id, { first: i === 0, last: i === g.length - 1 }));
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

      {/* `kind` rides along as a hidden field: searching from the News tab must
          not silently drop the operator back into the product vocabulary. */}
      <SearchBox
        basePath={BASE}
        q={q}
        placeholder="Cerca per nome o slug…"
        hidden={kind === "product" ? {} : { kind }}
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
        <div className="space-y-3">
          {ordered.map((c) => (
            <CategoryCard
              key={c.id}
              c={c}
              kind={active}
              position={pos.get(c.id) ?? { first: true, last: true }}
              childCount={children.get(c.id)?.length ?? 0}
            />
          ))}
        </div>
      )}

      {all.length > 1 && <MergePanel rows={allOrdered} />}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * One category
 * ------------------------------------------------------------------------- */

function CategoryCard({
  c,
  kind,
  position,
  childCount,
}: {
  c: CategoryWithUsage;
  kind: KindMeta;
  position: { first: boolean; last: boolean };
  /** Sub-categories filed under this one. */
  childCount: number;
}) {
  // The public page 404s on a hidden category, so the link is only offered
  // when it would open.
  const liveOnSite = kind.value === "product" && c.active;
  const usageHref = `${kind.listHref}?categoria=${encodeURIComponent(c.name)}`;

  return (
    <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div>
          <p className="font-display text-lg text-brown-950">
            {c.parentId && <span className="text-brown-800/40">↳ </span>}
            {c.name}
          </p>
          <p className="text-xs text-brown-800/60">
            <code>/{c.slug}</code>
            {" · "}
            {c.usage > 0 ? (
              <Link href={usageHref} className="font-semibold underline">
                {countOf(c.usage, kind)}
              </Link>
            ) : (
              countOf(c.usage, kind)
            )}
            {childCount > 0 &&
              ` · ${childCount} ${childCount === 1 ? "sottocategoria" : "sottocategorie"}`}
            {c.defaultVatRateBps != null && ` · IVA ${vatRateLabel(c.defaultVatRateBps)}`}
            {` · ordine ${c.sortOrder}`}
          </p>
        </div>
        {!c.active && <StatusBadge status="hidden" />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Order among siblings; the same order the shop rail and the pickers use. */}
        <ActionForm action={moveCategory} className="inline-flex">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="direction" value="up" />
          <PendingButton tone="dark" disabled={position.first}>
            <span aria-hidden="true">↑</span>
            <span className="sr-only">Sposta su</span>
          </PendingButton>
        </ActionForm>
        <ActionForm action={moveCategory} className="inline-flex">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="direction" value="down" />
          <PendingButton tone="dark" disabled={position.last}>
            <span aria-hidden="true">↓</span>
            <span className="sr-only">Sposta giù</span>
          </PendingButton>
        </ActionForm>

        <ActionForm action={toggleCategoryActive} className="inline-flex">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="active" value={c.active ? "false" : "true"} />
          <PendingButton tone="dark">{c.active ? "Nascondi" : "Mostra"}</PendingButton>
        </ActionForm>

        <Link href={`${BASE}/${c.id}`} className={pillCls}>
          Modifica
        </Link>

        {liveOnSite && (
          <Link href={`/negozio/categoria/${c.slug}`} target="_blank" rel="noopener" className={pillCls}>
            Sito ↗
          </Link>
        )}

        {/* Deleting a category in use is refused by the foreign key itself.
            Hiding the button when it cannot succeed keeps the list honest — the
            merge tool below is the way out. */}
        {c.usage === 0 && (
          <DeleteForm
            action={deleteCategory}
            id={c.id}
            confirm={
              childCount > 0
                ? `Eliminare la categoria "${c.name}"? Le sue ${childCount} sottocategorie passeranno al primo livello.`
                : `Eliminare la categoria "${c.name}"?`
            }
          />
        )}
      </div>
    </Panel>
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
