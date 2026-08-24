import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { getPurchasableProducts, getProductCategories, getSetting } from "@/lib/db/queries";
import PageHero from "@/components/site/PageHero";
import ProductTile from "@/components/site/ProductTile";
import { categoryAccent } from "@/lib/categories";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Ordina online le specialità della Norcineria Taccalite: porchetta, salumi e formaggi, con ritiro in bottega o spedizione.",
};

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

/**
 * The undo for the filter bar — square and hairlined like the rest of the shop's
 * chrome, never a pill.
 *
 * Dashed where the category filters are solid: it appears directly under that
 * row, and a solid hairline would read as one more category rather than as the
 * thing that clears them. Flooding brown on hover is the `outline` CTA's own
 * gesture, so the recovery action still speaks the site's language without
 * pulling the magnetic commercial button into a piece of filter chrome. It was
 * an underlined word inside a sentence before, which is the weakest possible
 * form for the only control that gets an empty grid back to a full one.
 */
function ResetFilters({ className }: { className?: string }) {
  return (
    <Link
      href="/negozio"
      aria-label="Rimuovi tutti i filtri"
      className={cn(
        // `.tap` and not taller padding: the control is drawn to match the
        // category filters beside it, and the 44px target arrives underneath.
        "tap group/reset inline-flex items-center gap-2.5 border border-dashed border-rule-strong",
        "px-5 py-3.5 text-[0.625rem] font-bold tracking-[0.18em] whitespace-nowrap text-brown-700 uppercase sm:py-2",
        "transition-[color,background-color,border-color,transform] duration-300",
        "hover:border-solid hover:border-brown-950 hover:bg-brown-950 hover:text-cream active:scale-[0.97]",
        "focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:ring-offset-paper focus-visible:outline-none",
        className
      )}
    >
      <span
        aria-hidden
        className="text-sm leading-none transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/reset:-rotate-180"
      >
        ↺
      </span>
      Rimuovi i filtri
    </Link>
  );
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
  const activeCategory = cat ? categories.find((c) => c.name === cat) : undefined;

  return (
    <div>
      <PageHero
        eyebrow="La bottega online"
        title={[
          "Le nostre specialità,",
          <span key="2" className="wonk text-gold-deep">
            a casa tua
          </span>,
        ]}
        lede="Ordina online e scegli il ritiro in bottega o la spedizione. Stessa qualità del banco."
      />

      <section className="bg-paper px-5 pb-16 sm:px-8 sm:pb-20 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          {!storeEnabled || products.length === 0 ? (
            <div className="border border-rule bg-paper-warm p-8 text-center sm:p-12">
              <h2 className="font-display display-md text-brown-950">Negozio in allestimento</h2>
              <p className="mt-3 text-brown-700">
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
              <div className="mb-8 space-y-5 sm:mb-10 sm:space-y-6">
                {/* Square, hairlined and set on the storefront's own ground. This bar was
                    the last of the old pill-and-white-card language still on the
                    site, and it made the shop — the page that has to sell — look
                    like a different product from the one around it. */}
                <form method="get" className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
                  {cat && <input type="hidden" name="cat" value={cat} />}
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-taupe" />
                    <input
                      type="search"
                      name="q"
                      defaultValue={q}
                      placeholder="Cerca un prodotto…"
                      aria-label="Cerca un prodotto"
                      className="w-full border border-rule-strong bg-paper py-3.5 pr-6 pl-11 text-sm text-brown-950 placeholder:text-taupe focus:border-gold-dark focus:outline-none"
                    />
                  </div>
                  {/* Sort and submit share a row on a phone rather than stacking:
                      three full-width bars pushed the first product below the
                      fold on the page whose whole job is showing products. */}
                  <div className="flex gap-2.5 sm:contents">
                    <select
                      name="sort"
                      defaultValue={sort}
                      aria-label="Ordina i prodotti"
                      className="min-w-0 flex-1 border border-rule-strong bg-paper px-4 py-3.5 text-sm font-medium text-brown-950 focus:border-gold-dark focus:outline-none sm:flex-none sm:px-5"
                    >
                      {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
                        <option key={s} value={s}>
                          {SORT_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="inline-flex shrink-0 items-center justify-center bg-brown-950 px-6 py-3.5 text-[0.6875rem] font-bold tracking-[0.18em] text-cream uppercase transition-colors hover:bg-brown-800 sm:px-8"
                    >
                      Applica
                    </button>
                  </div>
                </form>

                {categories.length > 0 && (
                  // A rail on a phone, a wrapped row above it. Eight categories
                  // at 375px wrapped to four lines — a 150px-tall block of
                  // chrome above the grid, which is more of the screen than the
                  // first product got. Bled to both edges so the row is visibly
                  // cut off rather than appearing to end at the gutter, which is
                  // the only thing that says "there is more this way".
                  <nav
                    className="no-scrollbar -mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
                    aria-label="Categorie"
                  >
                    <Link
                      href={buildHref({ q, sort: sp.sort }, { cat: "" })}
                      className={`shrink-0 snap-start border px-5 py-3.5 text-[0.625rem] font-bold tracking-[0.18em] uppercase transition-colors sm:py-2 ${
 !cat
 ? "border-brown-950 bg-brown-950 text-cream"
 : "border-rule-strong text-brown-700 hover:border-brown-950 hover:text-brown-950"
 }`}
                    >
                      Tutti
                    </Link>
                    {categories.map((c) => (
                      // Each filter wears its category's colour, so the row is the
                      // legend for the grid underneath it rather than eight
                      // identical brown pills. The colour is now the one the shop
                      // chose on the category, falling back to the keyword guess.
                      <Link
                        key={c.id}
                        href={buildHref({ q, sort: sp.sort }, { cat: c.name })}
                        style={{ "--acc": categoryAccent(c.name, c.accent) } as React.CSSProperties}
                        className={`flex shrink-0 snap-start items-center gap-2.5 border px-5 py-3.5 text-[0.625rem] font-bold tracking-[0.18em] whitespace-nowrap uppercase transition-colors sm:py-2 ${
 cat === c.name
 ? "border-[var(--acc)] bg-[color-mix(in_oklab,var(--acc)_14%,var(--paper))] text-[var(--acc)]"
 : "border-rule-strong text-brown-700 hover:border-[var(--acc)] hover:text-[var(--acc)]"
 }`}
                      >
                        <span aria-hidden className="size-[5px] rotate-45 bg-[var(--acc)]" />
                        {c.name}
                      </Link>
                    ))}
                  </nav>
                )}

                {/* The filter is a view of /negozio; the category also has a page
                    of its own, with the shop's own words about it. Linking it
                    here is what makes that page reachable at all. */}
                {activeCategory && (
                  <p className="mt-3 text-sm text-brown-700">
                    <Link
                      href={`/negozio/categoria/${activeCategory.slug}`}
                      className="font-semibold text-gold-deep underline"
                    >
                      Scopri {activeCategory.name}
                    </Link>{" "}
                    — la pagina dedicata.
                  </p>
                )}
              </div>

              {filtered.length === 0 ? (
                <div className="border border-rule bg-paper-warm p-8 text-center sm:p-12">
                  <h2 className="font-display display-md text-brown-950">Nessun risultato</h2>
                  <p className="mt-3 text-brown-700">Nessun prodotto corrisponde alla tua ricerca.</p>
                  {/* Out of the sentence and onto its own line: in an empty state
                      the way back is the whole point of the card, not an aside
                      trailing an orphaned full stop. */}
                  <ResetFilters className="mt-6 focus-visible:ring-offset-paper-warm" />
                </div>
              ) : (
                // Tighter gutters on a phone. At 375px a 24px gutter left each
                // tile 155px wide; at 14px they get 165px each, which is the
                // difference between a product name wrapping to two lines and
                // to three.
                <div className="grid grid-cols-2 gap-x-3.5 gap-y-10 sm:gap-x-7 sm:gap-y-14 lg:grid-cols-4">
                  {filtered.map((p) => (
                    <ProductTile
                      key={p.id}
                      product={{
                        slug: p.slug,
                        name: p.name,
                        category: p.category,
                        image: p.image,
                        imageLabel: p.imageLabel,
                        priceCents: p.priceCents,
                        unit: p.unit,
                        stock: p.stock,
                        purchasable: p.purchasable,
                        origin: p.origin,
                      }}
                    />
                  ))}
                </div>
              )}

              {hasFilters && filtered.length > 0 && (
                // The count and the reset are two different things — a caption and
                // a control — and the "·" that used to join them made the control
                // look like the second half of a sentence.
                <div className="mt-10 flex flex-col items-center border-t border-rule pt-8">
                  <p className="text-sm text-taupe">
                    {filtered.length} {filtered.length === 1 ? "prodotto" : "prodotti"}
                  </p>
                  <ResetFilters className="mt-4" />
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
