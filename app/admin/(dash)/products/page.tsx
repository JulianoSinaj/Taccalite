import Link from "next/link";
import {
  AdminHeader,
  Panel,
  StatusBadge,
  euro,
  inputCls,
  labelCls,
  NewButton,
  Pagination,
} from "@/components/admin/ui";
import {
  SegmentedFilter,
  FilterToolbar,
  ActiveFilters,
  chipsFrom,
  labelFrom,
} from "@/components/admin/FilterBar";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import {
  getProductsPage,
  adminGetShops,
  countExpiringSoon,
  getSavedViews,
  PRODUCT_SORTS,
} from "@/lib/admin/queries";
import { SavedViews } from "@/components/admin/SavedViews";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { productFilters, sortFilters, filterQuery } from "@/lib/admin/filters";
import { expiryWindow } from "@/lib/time";
import { getSetting } from "@/lib/db/queries";
import { isLowStock } from "@/lib/inventory";
import {
  archiveProduct,
  importProducts,
  toggleProductActive,
  toggleProductFeatured,
} from "@/lib/admin/actions";
import type { ProductRow } from "@/lib/db/schema";
import { shopScope, lockShop } from "@/lib/admin/scope";

export const dynamic = "force-dynamic";

const BASE = "/admin/products";

const STATUS_CHIPS = [
  { value: "all", label: "Tutti" },
  { value: "attivi", label: "Attivi" },
  { value: "disattivati", label: "Disattivati" },
  { value: "shop", label: "In vendita online" },
  { value: "archiviati", label: "Archiviati" },
];

const STOCK_CHIPS = [
  { value: "all", label: "Tutte le scorte" },
  { value: "basse", label: "Scorte basse" },
  { value: "esaurite", label: "Esauriti" },
  { value: "illimitate", label: "Senza giacenza" },
];

type SP = {
  searchParams: Promise<{
    negozio?: string;
    categoria?: string;
    stato?: string;
    scorte?: string;
    q?: string;
    page?: string;
    colonna?: string;
    verso?: string;
  }>;
};

export default async function AdminProducts({ searchParams }: SP) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  // A staff account assigned to a location is *confined* to it: the facet is
  // forced here rather than merely pre-selected, so editing the query string
  // cannot widen the view. Admins and unassigned accounts see everything.
  const scope = await shopScope();
  const filters = productFilters({ ...sp, negozio: lockShop(sp.negozio, scope) });
  const sort = sortFilters(sp, PRODUCT_SORTS, { colonna: "ordine", verso: "asc" });
  const lowStockThreshold = await getSetting<number>("store.lowStockThreshold", 5);
  // A week ahead is the window a shop can still act on.
  const expiryHorizon = expiryWindow(7);
  const viewer = await getCurrentUser();
  // Bulk CSV import and export are full-admin operations server-side (a price
  // list rewrites the catalogue; an export is a bulk dump). Staff used to see
  // both controls and only find out on submit.
  const [{ rows: products, total, pageCount, categories }, shops, expiringSoon, views, admin] =
    await Promise.all([
      getProductsPage({ ...filters, page, sort, lowStockThreshold }),
      adminGetShops(),
      countExpiringSoon(expiryHorizon),
      viewer ? getSavedViews(viewer.id, BASE) : Promise.resolve([]),
      isAdmin(),
    ]);

  const filtered = Object.values(filters).some((v) => v && v !== "all");
  // Carried on every sort/page link so the view survives navigation.
  const linkParams = { ...filters, colonna: sort.colonna, verso: sort.verso };
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));
  const SHOP_CHIPS = [
    { value: "all", label: "Tutte le sedi" },
    ...shops.map((s) => ({ value: s.slug, label: s.name })),
  ];
  const CATEGORY_CHIPS = chipsFrom(categories, "Tutte le categorie");

  const columns: Column<ProductRow>[] = [
    {
      key: "nome",
      header: "Prodotto",
      sortable: true,
      sticky: true,
      cell: (p) => (
        <div>
          <Link href={`/admin/products/${p.id}`} className="font-semibold text-brown-950 hover:underline">
            {p.name}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {!p.active && <StatusBadge status="cancelled" />}
            {p.purchasable && (
              <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-bold tracking-widest text-ok-soft-fg uppercase">
                Shop
              </span>
            )}
            {p.featured && (
              <span className="rounded-full bg-gold/25 px-2 py-0.5 text-[11px] font-bold tracking-widest text-brown-950 uppercase">
                ★
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "categoria",
      header: "Categoria",
      sortable: true,
      hideOnMobile: true,
      cell: (p) => <span className="text-brown-800/70">{p.category || "—"}</span>,
    },
    {
      key: "negozio",
      header: "Sede",
      hideOnMobile: true,
      cell: (p) => <span className="text-brown-800/70">{shopName.get(p.shopSlug) ?? p.shopSlug}</span>,
    },
    {
      key: "prezzo",
      header: "Prezzo",
      sortable: true,
      align: "right",
      cell: (p) => (
        <span className="tabular-nums text-brown-950">
          {euro(p.priceCents)}
          {p.unit ? <span className="text-xs text-brown-800/50"> /{p.unit}</span> : null}
        </span>
      ),
    },
    {
      key: "giacenza",
      header: "Giacenza",
      sortable: true,
      align: "right",
      cell: (p) =>
        p.stock == null ? (
          <span className="text-xs text-brown-800/40">illimitata</span>
        ) : isLowStock(p, lowStockThreshold) ? (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold tabular-nums text-danger-soft-fg">
            {p.stock}
          </span>
        ) : (
          <span className="tabular-nums text-brown-950">{p.stock}</span>
        ),
    },
    {
      key: "azioni",
      header: <span className="sr-only">Azioni</span>,
      align: "right",
      cell: (p) => (
        <div className="flex items-center justify-end gap-1.5">
          <ActionForm action={toggleProductFeatured} className="inline-flex">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="featured" value={p.featured ? "false" : "true"} />
            <PendingButton tone={p.featured ? "gold" : "dark"}>{p.featured ? "★" : "☆"}</PendingButton>
          </ActionForm>
          <ActionForm action={toggleProductActive} className="inline-flex">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="active" value={p.active ? "false" : "true"} />
            <PendingButton tone="dark">{p.active ? "Disattiva" : "Attiva"}</PendingButton>
          </ActionForm>
          <Link
            href={`/admin/products/${p.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-3 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Modifica
          </Link>
          {/* Archiving is the default: deleting cascades the product's stock
              movements away, and the ledger is the point of having one. */}
          <ActionForm action={archiveProduct} className="inline-flex">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="restore" value={p.archivedAt ? "true" : "false"} />
            <PendingButton
              tone="dark"
              confirm={
                p.archivedAt
                  ? undefined
                  : `Archiviare "${p.name}"? Sparisce dal catalogo e dal sito, ma storico e movimenti restano.`
              }
            >
              {p.archivedAt ? "Ripristina" : "Archivia"}
            </PendingButton>
          </ActionForm>
        </div>
      ),
    },
  ];

  return (
    <div>
      <AdminHeader
        title="Prodotti"
        subtitle={`${total} prodotti${filtered ? " nel filtro attuale" : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/products/scadenze"
              className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
                expiringSoon > 0
                  ? "bg-warn-soft text-warn-soft-fg hover:brightness-95"
                  : "bg-brown-900/10 text-brown-950 hover:bg-brown-900/15"
              }`}
            >
              Scadenze{expiringSoon > 0 ? ` · ${expiringSoon}` : ""}
            </Link>
            {admin ? (
              <>
                {/* The movement ledger is what a stocktake gets reconciled
                    against, and it was readable twenty rows at a time on a
                    product page with no way to take it anywhere. */}
                <a
                  href="/api/admin/export/stock-movements"
                  download
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                  title="Tutti i movimenti di giacenza, con motivo e operatore"
                >
                  Movimenti CSV
                </a>
                <a
                  href={`/api/admin/export/products${filterQuery({ ...filters })}`}
                  download
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                >
                  Esporta CSV
                </a>
              </>
            ) : null}
            <NewButton href="/admin/products/new">+ Nuovo prodotto</NewButton>
          </div>
        }
      />

      {/* Stock is the catalogue's work queue — "what do I need to reorder" is
          the question this page gets opened for. The rest are refinements. */}
      <SegmentedFilter
        basePath={BASE}
        params={linkParams}
        name="scorte"
        options={STOCK_CHIPS}
        label="Filtra per scorte"
      />

      <FilterToolbar
        basePath={BASE}
        params={linkParams}
        searchPlaceholder="Nome, slug o categoria…"
        carry={["scorte"]}
        formId="products-filters"
        facets={[
          { name: "negozio", label: "Sede", options: SHOP_CHIPS },
          { name: "categoria", label: "Categoria", options: CATEGORY_CHIPS },
          { name: "stato", label: "Stato", options: STATUS_CHIPS },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ActiveFilters
          basePath={BASE}
          params={linkParams}
          labels={{
            scorte: { title: "Scorte", format: labelFrom(STOCK_CHIPS) },
            negozio: { title: "Sede", format: labelFrom(SHOP_CHIPS) },
            categoria: { title: "Categoria" },
            stato: { title: "Stato", format: labelFrom(STATUS_CHIPS) },
            q: { title: "Ricerca", format: (v) => `“${v}”` },
          }}
        />
      </div>

      <SavedViews path={BASE} views={views} currentQuery={filterQuery(filters).replace(/^\?/, "")} />

      {/* Import sits behind a disclosure: it's a periodic job (a supplier price
          list), not something to trip over while browsing the catalogue. Full
          admins only, matching the action's own guard. */}
      {admin && (
        <details className="mb-4">
          <summary className="w-fit cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
            Importa listino da CSV
          </summary>
          <Panel className="mt-3">
            <ActionForm action={importProducts} className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <label className={labelCls} htmlFor="import-file">
                  File CSV
                </label>
                <input
                  id="import-file"
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  className="block w-full text-sm text-brown-800 file:mr-3 file:rounded-full file:border-0 file:bg-brown-900/10 file:px-4 file:py-2 file:text-xs file:font-bold file:tracking-widest file:uppercase"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="import-shop">
                  Sede per i nuovi prodotti
                </label>
                <select id="import-shop" name="shopSlug" className={inputCls}>
                  {shops.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 pb-2.5 text-sm font-medium text-brown-900">
                <input type="checkbox" name="crea" value="true" className="h-4 w-4 rounded accent-brown-950" />
                Crea i prodotti sconosciuti
              </label>
              <PendingButton tone="dark">Importa</PendingButton>
            </ActionForm>
            <p className="mt-3 text-xs text-brown-800/60">
              Le colonne sono le stesse dell&apos;esportazione e i prodotti si riconoscono dallo{" "}
              <code>slug</code>. Una cella vuota lascia il valore invariato, quindi un foglio con solo{" "}
              <code>slug,prezzoEuros</code> è un aggiornamento prezzi. Se il file contiene errori non
              viene importato nulla.
            </p>
          </Panel>
        </details>
      )}

      <DataTable
        rows={products}
        columns={columns}
        rowKey={(p) => p.id}
        basePath={BASE}
        params={linkParams}
        sort={sort}
        empty={
          filtered
            ? "Nessun prodotto corrisponde ai filtri."
            : "Nessun prodotto ancora. Aggiungine uno con «Nuovo prodotto»."
        }
      />

      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={linkParams} />
    </div>
  );
}
