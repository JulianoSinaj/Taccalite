import Link from "next/link";
import { AdminHeader, StatusBadge, euro, NewButton, Pagination } from "@/components/admin/ui";
import { FilterChips, FilterSearch, chipsFrom } from "@/components/admin/FilterBar";
import { DataTable, DensityToggle, densityFrom, type Column } from "@/components/admin/DataTable";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { getProductsPage, adminGetShops, PRODUCT_SORTS } from "@/lib/admin/queries";
import { productFilters, sortFilters } from "@/lib/admin/filters";
import { getSetting } from "@/lib/db/queries";
import { isLowStock } from "@/lib/inventory";
import { deleteProduct, toggleProductActive, toggleProductFeatured } from "@/lib/admin/actions";
import type { ProductRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const BASE = "/admin/products";

const STATUS_CHIPS = [
  { value: "all", label: "Tutti" },
  { value: "attivi", label: "Attivi" },
  { value: "disattivati", label: "Disattivati" },
  { value: "shop", label: "In vendita online" },
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
    densita?: string;
  }>;
};

export default async function AdminProducts({ searchParams }: SP) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const filters = productFilters(sp);
  const sort = sortFilters(sp, PRODUCT_SORTS, { colonna: "ordine", verso: "asc" });
  const density = densityFrom(sp.densita);
  const lowStockThreshold = await getSetting<number>("store.lowStockThreshold", 5);
  const [{ rows: products, total, pageCount, categories }, shops] = await Promise.all([
    getProductsPage({ ...filters, page, sort, lowStockThreshold }),
    adminGetShops(),
  ]);

  const filtered = Object.values(filters).some((v) => v && v !== "all");
  // Carried on every sort/density/page link so the view survives navigation.
  const linkParams = { ...filters, colonna: sort.colonna, verso: sort.verso, densita: sp.densita };
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));

  const columns: Column<ProductRow>[] = [
    {
      key: "nome",
      header: "Prodotto",
      sortable: true,
      cell: (p) => (
        <div>
          <Link href={`/admin/products/${p.id}`} className="font-semibold text-brown-950 hover:underline">
            {p.name}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {!p.active && <StatusBadge status="cancelled" />}
            {p.purchasable && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold tracking-widest text-emerald-800 uppercase">
                Shop
              </span>
            )}
            {p.featured && (
              <span className="rounded-full bg-gold/25 px-2 py-0.5 text-[10px] font-bold tracking-widest text-brown-950 uppercase">
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
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold tabular-nums text-red-700">
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
            className="rounded-full bg-brown-900/10 px-3 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Modifica
          </Link>
          <DeleteForm action={deleteProduct} id={p.id} confirm={`Eliminare "${p.name}"?`} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <AdminHeader
        title="Prodotti"
        subtitle={`${total} prodotti${filtered ? " nel filtro attuale" : ""}`}
        action={<NewButton href="/admin/products/new">+ Nuovo prodotto</NewButton>}
      />

      <FilterChips
        basePath={BASE}
        params={linkParams}
        name="negozio"
        options={[
          { value: "all", label: "Tutte le sedi" },
          ...shops.map((s) => ({ value: s.slug, label: s.name })),
        ]}
      />
      <FilterChips basePath={BASE} params={linkParams} name="stato" options={STATUS_CHIPS} tone="dark" />
      <FilterChips basePath={BASE} params={linkParams} name="scorte" options={STOCK_CHIPS} tone="deep" />
      <FilterChips
        basePath={BASE}
        params={linkParams}
        name="categoria"
        options={chipsFrom(categories, "Tutte le categorie")}
        className="mb-4"
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <FilterSearch basePath={BASE} params={linkParams} placeholder="Nome, slug o categoria…" />
        </div>
        <DensityToggle basePath={BASE} params={linkParams} density={density} />
      </div>

      <DataTable
        rows={products}
        columns={columns}
        rowKey={(p) => p.id}
        basePath={BASE}
        params={linkParams}
        sort={sort}
        density={density}
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
