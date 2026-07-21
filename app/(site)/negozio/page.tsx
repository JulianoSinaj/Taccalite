import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { getPurchasableProducts, getProductCategories, getSetting } from "@/lib/db/queries";
import AddToCartButton from "@/components/store/AddToCartButton";
import { formatEuro } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "E-Shop",
  description:
    "Ordina online le specialità della Norcineria Taccalite: porchetta, salumi e formaggi, con ritiro in bottega o spedizione.",
};

const LOW_STOCK_THRESHOLD = 5;

type Sort = "name" | "price-asc" | "price-desc";
const SORT_LABELS: Record<Sort, string> = {
  name: "Nome (A-Z)",
  "price-asc": "Prezzo crescente",
  "price-desc": "Prezzo decrescente",
};

type SearchParams = { searchParams: Promise<{ q?: string; cat?: string; sort?: string }> };

/** Build a /negozio query string, overriding the given keys. */
function buildHref(current: { q?: string; cat?: string; sort?: string }, override: Partial<{ q: string; cat: string; sort: string }>) {
  const params = new URLSearchParams();
  const merged = { ...current, ...override };
  if (merged.q) params.set("q", merged.q);
  if (merged.cat) params.set("cat", merged.cat);
  if (merged.sort) params.set("sort", merged.sort);
  const qs = params.toString();
  return qs ? `/negozio?${qs}` : "/negozio";
}

export default async function StorePage({ searchParams }: SearchParams) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const cat = sp.cat?.trim() ?? "";
  const sort: Sort = sp.sort === "price-asc" || sp.sort === "price-desc" || sp.sort === "name" ? sp.sort : "name";

  const [products, categories, storeEnabled] = await Promise.all([
    getPurchasableProducts(),
    getProductCategories(),
    getSetting<boolean>("store.enabled", true),
  ]);

  // Server-side filtering + sorting.
  const query = q.toLowerCase();
  let filtered = products.filter((p) => {
    if (cat && p.category !== cat) return false;
    if (query) {
      const haystack = `${p.name} ${p.description}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  filtered = [...filtered].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "it");
    const pa = a.priceCents ?? 0;
    const pb = b.priceCents ?? 0;
    return sort === "price-asc" ? pa - pb : pb - pa;
  });

  const hasFilters = Boolean(q || cat || sp.sort);

  return (
    <div>
      <section className="relative overflow-hidden bg-[#1c1512] px-5 pt-44 pb-20 sm:px-10 sm:pt-56 sm:pb-24">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="relative mx-auto max-w-7xl">
          <span className="eyebrow mb-6 block">La bottega online</span>
          <h1 className="font-display max-w-3xl text-5xl leading-[0.95] tracking-tighter text-cream sm:text-7xl">
            Le nostre specialità, <span className="text-gold italic">a casa tua</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg font-light text-cream/75">
            Ordina online e scegli il ritiro in bottega o la spedizione. Stessa qualità del banco.
          </p>
        </div>
      </section>

      <section className="bg-cream px-5 py-20 sm:px-10 sm:py-28">
        <div className="mx-auto max-w-7xl">
          {!storeEnabled || products.length === 0 ? (
            <div className="rounded-[28px] border border-brown-900/10 bg-white/60 p-12 text-center">
              <h2 className="font-display text-3xl text-brown-950">Negozio in allestimento</h2>
              <p className="mt-3 text-brown-900/70">
                Le vendite online saranno presto disponibili. Nel frattempo passa in bottega o{" "}
                <Link href="/prenotazioni" className="font-semibold text-gold-deep underline">
                  prenota la tua porchetta
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              {/* Filter bar */}
              <div className="mb-10 space-y-6">
                <form method="get" className="flex flex-col gap-3 sm:flex-row">
                  {cat && <input type="hidden" name="cat" value={cat} />}
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-brown-900/40" />
                    <input
                      type="search"
                      name="q"
                      defaultValue={q}
                      placeholder="Cerca un prodotto…"
                      aria-label="Cerca un prodotto"
                      className="w-full rounded-full border border-brown-900/15 bg-white/70 py-3.5 pl-12 pr-6 text-sm text-brown-950 placeholder:text-brown-900/40 focus:border-gold focus:outline-none"
                    />
                  </div>
                  <select
                    name="sort"
                    defaultValue={sort}
                    aria-label="Ordina i prodotti"
                    className="rounded-full border border-brown-900/15 bg-white/70 px-6 py-3.5 text-sm font-medium text-brown-950 focus:border-gold focus:outline-none"
                  >
                    {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
                      <option key={s} value={s}>
                        {SORT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-full bg-brown-950 px-8 py-3.5 text-sm font-semibold text-cream transition-colors hover:bg-brown-900"
                  >
                    Applica
                  </button>
                </form>

                {categories.length > 0 && (
                  <nav className="flex flex-wrap gap-2" aria-label="Categorie">
                    <Link
                      href={buildHref({ q, sort: sp.sort }, { cat: "" })}
                      className={`rounded-full px-5 py-2 text-xs font-bold tracking-widest uppercase transition-colors ${
                        !cat
                          ? "bg-brown-950 text-cream"
                          : "border border-brown-900/15 text-brown-900/70 hover:border-brown-900/40"
                      }`}
                    >
                      Tutti
                    </Link>
                    {categories.map((c) => (
                      <Link
                        key={c}
                        href={buildHref({ q, sort: sp.sort }, { cat: c })}
                        className={`rounded-full px-5 py-2 text-xs font-bold tracking-widest uppercase transition-colors ${
                          cat === c
                            ? "bg-brown-950 text-cream"
                            : "border border-brown-900/15 text-brown-900/70 hover:border-brown-900/40"
                        }`}
                      >
                        {c}
                      </Link>
                    ))}
                  </nav>
                )}
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-[28px] border border-brown-900/10 bg-white/60 p-12 text-center">
                  <h2 className="font-display text-3xl text-brown-950">Nessun risultato</h2>
                  <p className="mt-3 text-brown-900/70">
                    Nessun prodotto corrisponde alla tua ricerca.{" "}
                    <Link href="/negozio" className="font-semibold text-gold-deep underline">
                      Rimuovi i filtri
                    </Link>
                    .
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((p) => {
                    const soldOut = p.stock === 0;
                    const lowStock = p.stock != null && p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD;
                    return (
                      <div
                        key={p.id}
                        className="flex flex-col overflow-hidden rounded-[24px] border border-brown-900/10 bg-white/60"
                      >
                        <Link
                          href={`/negozio/${p.slug}`}
                          className="relative block aspect-[4/3] overflow-hidden bg-cream-dark"
                        >
                          {p.image ? (
                            <Image src={p.image} alt={p.name} fill className="object-cover" sizes="(max-width:1024px) 100vw, 33vw" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs font-bold tracking-widest text-brown-800/40 uppercase">
                              {p.imageLabel || p.name}
                            </div>
                          )}
                          {soldOut && (
                            <span className="absolute left-4 top-4 rounded-full bg-brown-950 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cream uppercase">
                              Esaurito
                            </span>
                          )}
                          {lowStock && (
                            <span className="absolute left-4 top-4 rounded-full bg-gold px-3 py-1.5 text-[10px] font-bold tracking-widest text-brown-950 uppercase">
                              Ultimi {p.stock}
                            </span>
                          )}
                        </Link>
                        <div className="flex flex-1 flex-col p-6">
                          <p className="text-[10px] font-bold tracking-widest text-gold-deep uppercase">{p.category}</p>
                          <Link href={`/negozio/${p.slug}`}>
                            <h3 className="font-display mt-1 text-2xl text-brown-950 transition-colors hover:text-gold-deep">
                              {p.name}
                            </h3>
                          </Link>
                          <p className="mt-2 flex-1 text-sm leading-relaxed text-brown-900/70">{p.description}</p>
                          <div className="mt-4 flex items-baseline gap-1">
                            <span className="font-display text-2xl font-bold text-brown-950">
                              {formatEuro(p.priceCents ?? 0)}
                            </span>
                            {p.unit && <span className="text-sm text-brown-800/60">/ {p.unit}</span>}
                          </div>
                          <AddToCartButton
                            product={{
                              slug: p.slug,
                              name: p.name,
                              priceCents: p.priceCents ?? 0,
                              unit: p.unit,
                              image: p.image,
                            }}
                            stock={p.stock}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {hasFilters && filtered.length > 0 && (
                <p className="mt-8 text-center text-sm text-brown-900/55">
                  {filtered.length} {filtered.length === 1 ? "prodotto" : "prodotti"} ·{" "}
                  <Link href="/negozio" className="font-semibold text-gold-deep underline">
                    Rimuovi i filtri
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
