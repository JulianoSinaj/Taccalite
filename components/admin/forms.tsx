"use client";

import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { inputCls, labelCls } from "./ui";
import { ActionForm, FieldError, PendingButton } from "./ActionForm";
import { HoursEditor } from "./HoursEditor";
import { saveProduct, saveBlogPost, saveShop, saveReward } from "@/lib/admin/actions";
import { saveDiscount } from "@/lib/admin/discount-actions";
import { saveCategory } from "@/lib/admin/category-actions";
import { CATEGORY_ACCENTS } from "@/lib/categories";
import { BLOG_LAYOUTS, resolveLayout } from "@/lib/blog-article";
import { createUser } from "@/lib/admin/user-actions";
import { VAT_RATES_BPS, vatRateLabel } from "@/lib/fiscal";
import type {
  ProductRow,
  BlogPostRow,
  ShopRow,
  RewardRow,
  DiscountCodeRow,
  CategoryRow,
} from "@/lib/db/schema";

/**
 * Per-field ids, unique to this instance of the component.
 *
 * The forms in here paired a `<label>` with the control *below* it and never
 * connected the two: no `htmlFor`, no `id`, no wrapping. Clicking a field's
 * label did nothing, and a screen reader announced every one of them as an
 * unnamed edit box — 103 controls across the gestionale's four form components.
 *
 * Ids come from `useId` rather than the field name because the same form is
 * rendered many times on one page: `/admin/reservations` mounts a
 * `ReservationForm` per row, so `id="name"` would repeat down the page and the
 * browser would bind every label to the first one — the original bug wearing a
 * different hat. `useId` is per instance, so each row gets its own namespace.
 */
export function useFieldIds(): (name: string) => string {
  const uid = useId();
  return (name: string) => `${uid}-${name}`;
}

/** yyyy-mm-dd for a date input default, or "" for null. */
function dateValue(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-brown-900">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 rounded accent-brown-950" />
      {label}
    </label>
  );
}

/**
 * Image field: a live preview, an image URL text input, and a file upload. The
 * uploaded file (if any) takes precedence over the URL — handled server-side by
 * `applyImageUpload` in the save actions.
 */
function ImageField({ current }: { current?: string | null }) {
  const fid = useFieldIds();
  const [url, setUrl] = useState(current ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  // Clear both the URL and any picked file so a nullable image can be unset.
  function clearImage() {
    setUrl("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="sm:col-span-2">
      <label className={labelCls} htmlFor={fid("image")}>Immagine</label>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- simple admin preview
        <img src={url} alt="" className="mb-2 h-24 w-24 rounded-lg object-cover ring-1 ring-brown-900/10" />
      ) : null}
      <input
        id={fid("image")}
        name="image"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="URL immagine…"
        className={inputCls}
      />
      <input
        ref={fileRef}
        name="imageFile"
        type="file"
        aria-label="Carica un'immagine dal dispositivo"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="mt-2 block text-sm text-brown-800 file:mr-3 file:rounded-full file:border-0 file:bg-brown-900/10 file:px-4 file:py-2 file:text-xs file:font-bold file:tracking-widest file:uppercase hover:file:bg-brown-900/15"
      />
      <div className="mt-2 flex items-center gap-3">
        {url ? (
          <button
            type="button"
            onClick={clearImage}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Rimuovi immagine
          </button>
        ) : null}
        <p className="text-xs text-brown-800/70">
          Carica JPG/PNG/WebP/AVIF (max 5 MB) oppure incolla un URL. Il file caricato ha la precedenza.
        </p>
      </div>
    </div>
  );
}

export function ProductForm({
  product,
  shops,
  categories = [],
}: {
  product?: ProductRow | null;
  shops: ShopRow[];
  /** Product categories, in editorial order. A closed list now: free text is what
   *  let one mistyped "Formaggio" fork the catalogue with nothing to warn you. */
  categories?: CategoryRow[];
}) {
  const fid = useFieldIds();
  // For a NEW product, choosing a category adopts the rate that category
  // declares. An existing product keeps its stored rate — changing a saved
  // product's category must not silently restate its VAT.
  const [vatBps, setVatBps] = useState(product?.vatRateBps ?? 1000);

  function onCategoryChange(id: string) {
    if (product) return;
    const declared = categories.find((c) => c.id === id)?.defaultVatRateBps;
    if (declared != null) setVatBps(declared);
  }

  return (
    <ActionForm
      action={saveProduct}
      redirectTo="/admin/products"
      guardUnsaved="Le modifiche a questo prodotto non sono state salvate. Se esci adesso vanno perse."
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {product && <input type="hidden" name="id" value={product.id} />}

      <FormSection title="Anagrafica" hint="Come il prodotto si chiama, dove sta e in che reparto.">
        <div>
          <label className={labelCls} htmlFor={fid("name")}>Nome</label>
          <input id={fid("name")} name="name" required defaultValue={product?.name} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("slug")}>Slug</label>
          <input
            id={fid("slug")}
            name="slug"
            defaultValue={product?.slug}
            placeholder="auto dal nome se vuoto"
            className={inputCls}
          />
          <FieldError name="slug" />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("shopSlug")}>Negozio</label>
          <select id={fid("shopSlug")} name="shopSlug" defaultValue={product?.shopSlug} className={inputCls}>
            {shops.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("categoryId")}>Categoria</label>
          <select
            id={fid("categoryId")}
            name="categoryId"
            defaultValue={product?.categoryId ?? ""}
            onChange={(e) => onCategoryChange(e.target.value)}
            className={inputCls}
          >
            <option value="">— Nessuna categoria —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? "  ↳ " : ""}
                {c.name}
                {c.active ? "" : " (nascosta)"}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-brown-800/70">
            Gestisci l&apos;elenco in{" "}
            <Link href="/admin/categories" className="font-semibold text-gold-deep underline">
              Categorie
            </Link>
            .
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor={fid("description")}>Descrizione</label>
          <textarea id={fid("description")} name="description" rows={3} defaultValue={product?.description} className={inputCls} />
        </div>
      </FormSection>

      <FormSection title="Immagine e ordine" hint="La foto della scheda prodotto, e la posizione nel listino.">
        <ImageField current={product?.image} />
        <div>
          <label className={labelCls} htmlFor={fid("imageLabel")}>Etichetta immagine</label>
          <input id={fid("imageLabel")} name="imageLabel" defaultValue={product?.imageLabel} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("sortOrder")}>Ordine</label>
          <input id={fid("sortOrder")} name="sortOrder" type="number" defaultValue={product?.sortOrder ?? 0} className={inputCls} />
        </div>
      </FormSection>

      <FormSection title="Prezzo e IVA" hint="Quanto costa al cliente, con che aliquota, e quanto costa alla bottega.">
        <div>
          <label className={labelCls} htmlFor={fid("priceEuros")}>Prezzo (€)</label>
          <input
            id={fid("priceEuros")}
            name="priceEuros"
            type="number"
            step="0.01"
            defaultValue={product?.priceCents != null ? (product.priceCents / 100).toFixed(2) : ""}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("unit")}>Unità (kg, pezzo…)</label>
          <input
            id={fid("unit")}
            name="unit"
            defaultValue={product?.unit ?? ""}
            placeholder="auto: kg se venduto a peso"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("vatRate")}>Aliquota IVA</label>
          <select
            id={fid("vatRate")}
            name="vatRate"
            value={String(vatBps / 100)}
            onChange={(e) => setVatBps(Math.round(Number(e.target.value) * 100))}
            className={inputCls}
          >
            {VAT_RATES_BPS.map((bps) => (
              <option key={bps} value={String(bps / 100)}>
                {vatRateLabel(bps)}
              </option>
            ))}
          </select>
          {!product && categories.some((c) => c.defaultVatRateBps != null) && (
            <p className="mt-1 text-xs text-brown-800/70">
              Proposta dall&apos;aliquota dichiarata sulla categoria; puoi cambiarla.
            </p>
          )}
        </div>
      </FormSection>

      <FormSection title="Magazzino" hint="Giacenza, soglia di riordino e i riferimenti del fornitore.">
        <div>
          <label className={labelCls} htmlFor={fid("stock")}>Giacenza (vuoto = illimitata)</label>
          <input id={fid("stock")} name="stock" type="number" min={0} defaultValue={product?.stock ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("reorderPoint")}>Soglia di riordino</label>
          <input
            id={fid("reorderPoint")}
            name="reorderPoint"
            type="number"
            min={0}
            defaultValue={product?.reorderPoint ?? ""}
            placeholder="vuoto = soglia generale"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("costEuros")}>Costo d&apos;acquisto (€, senza IVA)</label>
          <input
            id={fid("costEuros")}
            name="costEuros"
            type="number"
            step="0.01"
            min={0}
            defaultValue={product?.costCents != null ? (product.costCents / 100).toFixed(2) : ""}
            placeholder="per il calcolo del margine"
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor={fid("sku")}>Codice / SKU</label>
            <input id={fid("sku")} name="sku" defaultValue={product?.sku ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor={fid("supplier")}>Fornitore</label>
            <input id={fid("supplier")} name="supplier" defaultValue={product?.supplier ?? ""} className={inputCls} />
          </div>
        </div>
      </FormSection>

      <FormSection title="Etichetta e tracciabilità" hint="Quello che deve comparire in vetrina e nella scheda del sito.">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor={fid("origin")}>Provenienza / tracciabilità</label>
          <input
            id={fid("origin")}
            name="origin"
            defaultValue={product?.origin ?? ""}
            placeholder="es. Suino nazionale — Marche"
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor={fid("allergens")}>Allergeni (separati da virgola)</label>
          <input
            id={fid("allergens")}
            name="allergens"
            defaultValue={product?.allergens?.join(", ") ?? ""}
            placeholder="es. glutine, latte, frutta a guscio"
            className={inputCls}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor={fid("ingredients")}>Ingredienti</label>
          <textarea id={fid("ingredients")} name="ingredients" rows={2} defaultValue={product?.ingredients ?? ""} className={inputCls} />
        </div>
      </FormSection>

      <FormSection title="SEO" hint="Come il prodotto compare nei risultati di ricerca. Entrambi opzionali.">
        {/* SEO, as on the news diary: the description is a shelf label, not
            always the sentence a search result should show. */}
        <div>
          <label className={labelCls} htmlFor={fid("seoTitle")}>Titolo SEO (opzionale)</label>
          <input
            id={fid("seoTitle")}
            name="seoTitle"
            maxLength={70}
            defaultValue={product?.seoTitle ?? ""}
            placeholder={product?.name ?? "Usa il nome del prodotto"}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("seoDescription")}>Descrizione SEO (opzionale)</label>
          <textarea
            id={fid("seoDescription")}
            name="seoDescription"
            rows={2}
            maxLength={200}
            defaultValue={product?.seoDescription ?? ""}
            placeholder="Se vuota viene usata la descrizione."
            className={inputCls}
          />
        </div>
      </FormSection>

      <FormSection title="Visibilità" hint="Dove il prodotto compare, e se è ordinabile online.">
        <div className="flex flex-wrap items-center gap-6 pt-6 sm:col-span-2">
          <Toggle name="purchasable" label="Acquistabile online" defaultChecked={product?.purchasable} />
          <Toggle name="soldByWeight" label="Venduto a peso" defaultChecked={product?.soldByWeight} />
          {/* Off by default: "in evidenza" is the homepage strip, and every new
              product used to land there until somebody noticed. */}
          <Toggle name="featured" label="In evidenza" defaultChecked={product?.featured ?? false} />
          <Toggle name="active" label="Attivo" defaultChecked={product?.active ?? true} />
        </div>
      </FormSection>

      <div className="sm:col-span-2">
        <PendingButton>{product ? "Salva modifiche" : "Crea prodotto"}</PendingButton>
      </div>
    </ActionForm>
  );
}

export function BlogForm({
  post,
  categories = [],
}: {
  post?: BlogPostRow | null;
  /** News categories, in editorial order — the diary had no suggestions at all
   *  and accumulated near-duplicates the storefront then showed as separate
   *  filters. */
  categories?: CategoryRow[];
}) {
  const fid = useFieldIds();
  return (
    <ActionForm
      action={saveBlogPost}
      redirectTo="/admin/blog"
      guardUnsaved="Le modifiche a questo articolo non sono state salvate. Se esci adesso vanno perse."
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {post && <input type="hidden" name="id" value={post.id} />}
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={fid("title")}>Titolo</label>
        <input id={fid("title")} name="title" required defaultValue={post?.title} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("slug")}>Slug</label>
        <input id={fid("slug")} name="slug" defaultValue={post?.slug} placeholder="auto se vuoto" className={inputCls} />
        <FieldError name="slug" />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("date")}>Data</label>
        <input id={fid("date")} name="date" type="date" defaultValue={post?.date} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("categoryId")}>Categoria</label>
        <select id={fid("categoryId")} name="categoryId" defaultValue={post?.categoryId ?? ""} className={inputCls}>
          <option value="">— Nessuna categoria —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.active ? "" : " (nascosta)"}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-brown-800/70">
          Gestisci l&apos;elenco in{" "}
          <Link href="/admin/categories?kind=post" className="font-semibold text-gold-deep underline">
            Categorie
          </Link>
          .
        </p>
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("sortOrder")}>Ordine</label>
        <input id={fid("sortOrder")} name="sortOrder" type="number" defaultValue={post?.sortOrder ?? 0} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={fid("excerpt")}>Estratto</label>
        <textarea id={fid("excerpt")} name="excerpt" rows={2} defaultValue={post?.excerpt} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={fid("layout")}>
          Impaginazione
        </label>
        <select
          id={fid("layout")}
          name="layout"
          defaultValue={resolveLayout(post?.layout)}
          className={inputCls}
        >
          {BLOG_LAYOUTS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        {/* The hints, all four, rather than only the selected one: the choice is
            a comparison ("is this a story or a notice?"), and a description that
            appears only after you have already chosen cannot help you choose. */}
        <ul className="mt-2 space-y-1 text-xs text-brown-800/70">
          {BLOG_LAYOUTS.map((l) => (
            <li key={l.value}>
              <span className="font-semibold text-brown-950">{l.label.split(" — ")[0]}</span> —{" "}
              {l.hint}
            </li>
          ))}
        </ul>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="post-content">
          Contenuto (una riga vuota separa i blocchi)
        </label>
        <textarea
          id="post-content"
          name="content"
          rows={16}
          defaultValue={post?.content?.join("\n\n")}
          className={`${inputCls} font-mono text-[0.8125rem]`}
        />
        {/* The grammar, spelled out where it is typed. It is small enough to fit
            in a legend and useless anywhere else: nobody opens the docs to find
            out how to put a photograph in a paragraph. */}
        <div className="mt-2 rounded-lg border border-brown-700/15 bg-cream/60 p-3 text-xs leading-relaxed text-brown-800/70">
          <p className="font-semibold text-brown-950">Come si scrive</p>
          <ul className="mt-1.5 space-y-1">
            <li>
              <code>## Titolo</code> — titolo di sezione
            </li>
            <li>
              <code>- voce</code> — elenco puntato
            </li>
            <li>
              <code>&gt; Citazione</code>, con <code>— Chi l&apos;ha detta</code> sulla riga dopo
            </li>
            <li>
              <code>| Etichetta | Valore</code> — riga della tabella informazioni
            </li>
            <li>
              <code>![Didascalia](/images/foto.jpg)</code> — foto nel testo. Aggiungi{" "}
              <code>| alta</code>, <code>| quadrata</code> o <code>| panoramica</code> alla
              didascalia per cambiare il taglio.
            </li>
            <li>
              <code>**grassetto**</code> e <code>[testo](/pagina)</code> dentro una riga qualsiasi.
            </li>
          </ul>
        </div>
      </div>
      <ImageField current={post?.image} />
      <div>
        <label className={labelCls} htmlFor={fid("imageLabel")}>Etichetta immagine</label>
        <input id={fid("imageLabel")} name="imageLabel" defaultValue={post?.imageLabel} className={inputCls} />
      </div>

      {/* SEO. The excerpt doubles as the meta description when none is given,
          but a listing blurb and a search snippet aren't always the same text. */}
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="post-seo-title">
          Titolo SEO (opzionale)
        </label>
        <input
          id="post-seo-title"
          name="seoTitle"
          maxLength={70}
          defaultValue={post?.seoTitle ?? ""}
          placeholder={post?.title ?? "Usa il titolo dell'articolo"}
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="post-seo-desc">
          Descrizione SEO (opzionale)
        </label>
        <textarea
          id="post-seo-desc"
          name="seoDescription"
          rows={2}
          maxLength={200}
          defaultValue={post?.seoDescription ?? ""}
          placeholder="Se vuota viene usato l'estratto."
          className={inputCls}
        />
      </div>

      <div className="flex items-center pt-6">
        <Toggle name="published" label="Pubblicato" defaultChecked={post?.published ?? true} />
      </div>
      <div className="flex items-center pt-6 text-xs text-brown-800/70">
        Con una data futura l&apos;articolo resta nascosto fino a quel giorno.
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <PendingButton>{post ? "Salva modifiche" : "Crea news"}</PendingButton>
        {post && (
          <a
            href={`/blog/${post.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Vedi sul sito ↗
          </a>
        )}
      </div>
    </ActionForm>
  );
}

/** A titled group of fields inside a two-column admin form. */
function FormSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid grid-cols-1 gap-4 border-t border-brown-900/10 pt-5 first:border-t-0 first:pt-0 sm:col-span-2 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <h2 id={id} className="font-display text-base text-brown-950">
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-xs text-brown-800/70">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function ShopForm({ shop }: { shop?: ShopRow | null }) {
  const fid = useFieldIds();
  return (
    <ActionForm
      action={saveShop}
      redirectTo="/admin/shops"
      guardUnsaved="Le modifiche a questa sede non sono state salvate. Se esci adesso vanno perse."
      className="grid grid-cols-1 gap-5 sm:grid-cols-2"
    >
      {shop && <input type="hidden" name="id" value={shop.id} />}

      <FormSection title="Sede" hint="Nome e identificativo con cui la sede compare nel gestionale e sul sito.">
        <div>
          <label className={labelCls} htmlFor={fid("name")}>Nome</label>
          <input id={fid("name")} name="name" required maxLength={200} defaultValue={shop?.name} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("slug")}>Slug (identificativo URL)</label>
          <input
            id={fid("slug")}
            name="slug"
            required={!shop}
            pattern="[a-z0-9-]+"
            defaultValue={shop?.slug}
            placeholder="es. centro"
            readOnly={!!shop}
            aria-describedby={fid("slug-hint")}
            className={inputCls}
          />
          <FieldError name="slug" />
          <p id={fid("slug-hint")} className="mt-1 text-xs text-brown-800/70">
            {shop
              ? `Pagina pubblica: /sedi/${shop.slug}. Non modificabile dopo la creazione.`
              : "Solo lettere minuscole, numeri e trattini. Diventa l'indirizzo /sedi/<slug>."}
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("specialty")}>Specialità</label>
          <input id={fid("specialty")} name="specialty" maxLength={200} defaultValue={shop?.specialty} placeholder="es. Formaggi" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("sortOrder")}>Ordine</label>
          <input id={fid("sortOrder")} name="sortOrder" type="number" step={1} defaultValue={shop?.sortOrder ?? 0} className={inputCls} />
          <p className="mt-1 text-xs text-brown-800/70">Posizione negli elenchi: il numero più basso viene prima.</p>
        </div>
      </FormSection>

      <FormSection title="Contatti" hint="Indirizzo, telefono ed email mostrati ai clienti e usati nelle email di conferma.">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor={fid("address")}>Indirizzo</label>
          <input id={fid("address")} name="address" maxLength={300} defaultValue={shop?.address} placeholder="Via, numero — Città" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("phone")}>Telefono</label>
          <input id={fid("phone")} name="phone" type="tel" maxLength={60} defaultValue={shop?.phone} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("email")}>Email</label>
          <input id={fid("email")} name="email" type="email" maxLength={200} defaultValue={shop?.email} className={inputCls} />
        </div>
      </FormSection>

      <FormSection title="Orari di apertura" hint="Decidono il badge «aperto adesso», gli orari prenotabili per un tavolo e le fasce di ritiro.">
        <div className="sm:col-span-2">
          <HoursEditor shop={shop} />
        </div>
        <div className="sm:col-span-2">
          <Toggle name="hoursConfirmed" label="Orari confermati" defaultChecked={shop?.hoursConfirmed ?? true} />
          <p className="mt-1 text-xs text-brown-800/70">
            Se non confermati, il sito mostra gli orari con l&apos;avviso «da confermare» e nasconde il badge «aperto adesso».
          </p>
        </div>
      </FormSection>

      <FormSection title="Servizi e capacità" hint="Cosa offre questa sede sul sito e quanto può accogliere.">
        <div className="flex flex-wrap items-center gap-6 sm:col-span-2">
          <Toggle name="reservationsEnabled" label="Prenotazioni tavolo e ordini speciali" defaultChecked={shop?.reservationsEnabled ?? true} />
          <Toggle name="storeEnabled" label="Ritiro in negozio (store)" defaultChecked={shop?.storeEnabled ?? true} />
          <Toggle name="porchettaEnabled" label="Porchetta del sabato" defaultChecked={shop?.porchettaEnabled ?? true} />
        </div>
        {/* Capacity is per location: the two shops prepare separately, and one
            may seat twice as many people as the other. */}
        <div>
          <label className={labelCls} htmlFor={fid("porchettaCapacityKg")}>Capacità porchetta (kg al giorno)</label>
          <input
            id={fid("porchettaCapacityKg")}
            name="porchettaCapacityKg"
            type="number"
            min={0}
            max={10000}
            step={1}
            defaultValue={shop?.porchettaCapacityKg ?? ""}
            placeholder="usa il valore generale"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-brown-800/70">
            Vuoto: usa la capacità impostata in Impostazioni per tutte le sedi.
          </p>
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("seatsCapacity")}>Coperti per fascia oraria</label>
          <input
            id={fid("seatsCapacity")}
            name="seatsCapacity"
            type="number"
            min={0}
            max={1000}
            step={1}
            defaultValue={shop?.seatsCapacity ?? ""}
            placeholder="nessun limite"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-brown-800/70">
            Il sito rifiuta le prenotazioni oltre questo numero di ospiti nella stessa fascia; nel gestionale vengono solo segnalate.
          </p>
        </div>
      </FormSection>

      <FormSection title="Presentazione sul sito" hint="Testi e immagine della pagina pubblica della sede.">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor={fid("tagline")}>Tagline</label>
          <input id={fid("tagline")} name="tagline" maxLength={300} defaultValue={shop?.tagline} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor={fid("description")}>Descrizione</label>
          <textarea id={fid("description")} name="description" rows={3} maxLength={4000} defaultValue={shop?.description} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor={fid("highlights")}>Punti di forza (uno per riga)</label>
          <textarea id={fid("highlights")} name="highlights" rows={3} maxLength={2000} defaultValue={shop?.highlights.join("\n")} className={inputCls} />
        </div>
        <ImageField current={shop?.image} />
        <div>
          <label className={labelCls} htmlFor={fid("imageLabel")}>Etichetta immagine</label>
          <input id={fid("imageLabel")} name="imageLabel" maxLength={200} defaultValue={shop?.imageLabel} className={inputCls} />
        </div>
      </FormSection>

      <div className="sm:col-span-2">
        <PendingButton>{shop ? "Salva sede" : "Crea sede"}</PendingButton>
      </div>
    </ActionForm>
  );
}

export function DiscountForm({
  discount,
  shops = [],
}: {
  discount?: DiscountCodeRow | null;
  shops?: ShopRow[];
}) {
  const fid = useFieldIds();
  // The value field follows the type: a whole percent, euros for a fixed code,
  // nothing at all for free shipping — the server ignores it there, and
  // showing it invited a number that did nothing. Prefilled only while the
  // type is the stored one; "10" is not a sensible default for a code just
  // switched from 10% to a fixed amount.
  const [type, setType] = useState<DiscountCodeRow["type"]>(discount?.type ?? "percent");
  const valueDefault =
    discount && discount.type === type
      ? discount.type === "fixed"
        ? (discount.value / 100).toFixed(2)
        : String(discount.value)
      : "";
  // A used code's name is the key of its redemption ledger, so renaming it
  // would orphan the history. The field locks once the counter has moved; the
  // server refuses the rename regardless.
  const locked = (discount?.timesUsed ?? 0) > 0;
  return (
    <ActionForm
      action={saveDiscount}
      redirectTo="/admin/discounts"
      guardUnsaved="Le modifiche a questo codice non sono state salvate. Se esci adesso vanno perse."
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {discount && <input type="hidden" name="id" value={discount.id} />}
      <div>
        <label className={labelCls} htmlFor={fid("code")}>Codice</label>
        <input
          id={fid("code")}
          name="code"
          required
          readOnly={locked}
          aria-describedby={locked ? fid("code-hint") : undefined}
          defaultValue={discount?.code}
          placeholder="es. BENVENUTO10"
          className={`${inputCls} uppercase ${locked ? "opacity-70" : ""}`}
        />
        <FieldError name="code" />
        {locked && (
          <p id={fid("code-hint")} className="mt-1 text-xs text-brown-800/70">
            Usato {discount!.timesUsed} volte: il nome non si può più cambiare. Per un nome nuovo crea un
            altro codice e disattiva questo.
          </p>
        )}
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("type")}>Tipo</label>
        <select
          id={fid("type")}
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as DiscountCodeRow["type"])}
          className={inputCls}
        >
          <option value="percent">Percentuale (%)</option>
          <option value="fixed">Importo fisso (€)</option>
          <option value="free_shipping">Spedizione gratuita</option>
        </select>
      </div>
      {type !== "free_shipping" && (
        <div>
          <label className={labelCls} htmlFor={fid("value")}>
            {type === "percent" ? "Sconto (%)" : "Sconto (€)"}
          </label>
          <input
            key={type}
            id={fid("value")}
            name="value"
            type="number"
            required
            min={type === "percent" ? 1 : 0.01}
            max={type === "percent" ? 100 : undefined}
            step={type === "percent" ? 1 : 0.01}
            defaultValue={valueDefault}
            placeholder={type === "percent" ? "es. 10" : "es. 5.00"}
            className={inputCls}
          />
        </div>
      )}
      <div>
        <label className={labelCls} htmlFor={fid("minSubtotalEuros")}>Spesa minima (€)</label>
        <input
          id={fid("minSubtotalEuros")}
          name="minSubtotalEuros"
          type="number"
          step="0.01"
          min={0}
          defaultValue={discount ? (discount.minSubtotalCents / 100).toFixed(2) : ""}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("maxRedemptions")}>Utilizzi massimi (vuoto = illimitati)</label>
        <input id={fid("maxRedemptions")} name="maxRedemptions" type="number" min={1} defaultValue={discount?.maxRedemptions ?? ""} className={inputCls} />
      </div>
      {/* Scoping. Without these a code was all-or-nothing: one customer could
          use a "benvenuto" code every week, and a code meant for one shop
          worked at both. */}
      <div>
        <label className={labelCls} htmlFor={fid("maxPerCustomer")}>Utilizzi per cliente (vuoto = illimitati)</label>
        <input
          id={fid("maxPerCustomer")}
          name="maxPerCustomer"
          type="number"
          min={1}
          defaultValue={discount?.maxPerCustomer ?? ""}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("shopSlug")}>Valido solo per la sede</label>
        <select id={fid("shopSlug")} name="shopSlug" defaultValue={discount?.shopSlug ?? ""} className={inputCls}>
          <option value="">Tutte le sedi</option>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor={fid("startsAt")}>Valido dal</label>
          <input id={fid("startsAt")} name="startsAt" type="date" defaultValue={dateValue(discount?.startsAt)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("endsAt")}>Valido al</label>
          <input id={fid("endsAt")} name="endsAt" type="date" defaultValue={dateValue(discount?.endsAt)} className={inputCls} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-6 pt-6 sm:col-span-2">
        <Toggle name="active" label="Attivo" defaultChecked={discount?.active ?? true} />
        <Toggle
          name="firstOrderOnly"
          label="Solo al primo ordine"
          defaultChecked={discount?.firstOrderOnly ?? false}
        />
      </div>
      <div className="sm:col-span-2">
        <PendingButton>{discount ? "Salva codice" : "Crea codice"}</PendingButton>
      </div>
    </ActionForm>
  );
}

/** New-account form. Editing an existing account's details lives on the users
 *  list (role, password and active state each have their own guarded action). */
export function UserForm({ shops = [] }: { shops?: { slug: string; name: string }[] }) {
  const fid = useFieldIds();
  // Only a staff account has a location to pick; showing the field for the
  // other roles invited a choice the server would then ignore.
  const [role, setRole] = useState("customer");
  return (
    <ActionForm
      action={createUser}
      redirectTo="/admin/users"
      guardUnsaved="Le modifiche a questo account non sono state salvate. Se esci adesso vanno perse."
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <div>
        <label className={labelCls} htmlFor={fid("username")}>Username</label>
        <input
          id={fid("username")}
          name="username"
          required
          minLength={3}
          maxLength={40}
          placeholder="es. mario.rossi"
          className={inputCls}
        />
        <FieldError name="username" />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("name")}>Nome</label>
        <input id={fid("name")} name="name" required maxLength={200} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("email")}>Email (facoltativa)</label>
        <input id={fid("email")} name="email" type="email" maxLength={200} className={inputCls} />
        <FieldError name="email" />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("role")}>Ruolo</label>
        <select
          id={fid("role")}
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={inputCls}
        >
          <option value="customer">Cliente</option>
          <option value="staff">Staff</option>
          <option value="admin">Amministratore</option>
        </select>
      </div>
      {role === "staff" && (
        <div>
          <label className={labelCls} htmlFor={fid("shopSlug")}>Sede</label>
          <select id={fid("shopSlug")} name="shopSlug" defaultValue="" className={inputCls}>
            <option value="">Tutte le sedi</option>
            {shops.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-brown-800/70">
            Uno staff assegnato a una sede vede e modifica solo gli ordini, i prodotti e le
            prenotazioni di quella sede.
          </p>
        </div>
      )}
      <div>
        <label className={labelCls} htmlFor={fid("password")}>Password</label>
        <input
          id={fid("password")}
          name="password"
          type="text"
          required
          minLength={8}
          placeholder="min. 8 caratteri"
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <PendingButton>Crea utente</PendingButton>
      </div>
    </ActionForm>
  );
}

export function RewardForm({ reward }: { reward?: RewardRow | null }) {
  const fid = useFieldIds();
  return (
    <ActionForm
      action={saveReward}
      redirectTo="/admin/rewards"
      guardUnsaved="Le modifiche a questo premio non sono state salvate. Se esci adesso vanno perse."
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {reward && <input type="hidden" name="id" value={reward.id} />}
      {/* The slug never appears in a public URL (rewards live only inside the
          account dashboard), so it is not editable: generated from the name on
          create, kept as-is on edit so a rename doesn't churn it. */}
      {reward && <input type="hidden" name="slug" value={reward.slug} />}
      <div>
        <label className={labelCls} htmlFor={fid("name")}>Nome</label>
        <input id={fid("name")} name="name" required maxLength={200} defaultValue={reward?.name} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("points")}>Punti richiesti</label>
        <input id={fid("points")} name="points" type="number" min={0} step={1} required defaultValue={reward?.points ?? 0} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={fid("description")}>Descrizione</label>
        <textarea id={fid("description")} name="description" rows={2} maxLength={2000} defaultValue={reward?.description} className={inputCls} />
        <p className="mt-1 text-xs text-brown-800/70">Mostrata al cliente nel catalogo fedeltà.</p>
      </div>

      {/* Availability: how many exist, how often one customer may claim it, and
          when it can be claimed at all. Blank means "no limit" throughout. */}
      <div>
        <label className={labelCls} htmlFor="reward-stock">
          Disponibilità (pezzi)
        </label>
        <input
          id="reward-stock"
          name="stock"
          type="number"
          min={0}
          defaultValue={reward?.stock ?? ""}
          placeholder="illimitata"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brown-800/70">
          Scalata a ogni riscatto e ripristinata se il riscatto viene annullato.
        </p>
      </div>
      <div>
        <label className={labelCls} htmlFor="reward-max">
          Limite per cliente
        </label>
        <input
          id="reward-max"
          name="maxPerCustomer"
          type="number"
          min={0}
          defaultValue={reward?.maxPerCustomer ?? ""}
          placeholder="nessun limite"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brown-800/70">Quante volte lo stesso cliente può riscattarlo.</p>
      </div>
      <div>
        <label className={labelCls} htmlFor="reward-from">
          Disponibile dal
        </label>
        <input
          id="reward-from"
          name="availableFrom"
          type="date"
          defaultValue={dateValue(reward?.availableFrom)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="reward-until">
          Disponibile fino al
        </label>
        <input
          id="reward-until"
          name="availableUntil"
          type="date"
          defaultValue={dateValue(reward?.availableUntil)}
          className={inputCls}
        />
      </div>

      <ImageField current={reward?.image} />
      <div>
        <label className={labelCls} htmlFor={fid("sortOrder")}>Ordine</label>
        <input id={fid("sortOrder")} name="sortOrder" type="number" step={1} defaultValue={reward?.sortOrder ?? 0} className={inputCls} />
        <p className="mt-1 text-xs text-brown-800/70">Numero più basso = mostrato prima.</p>
      </div>
      <div className="flex items-center sm:col-span-2">
        <Toggle name="active" label="Attivo (visibile e riscattabile dai clienti)" defaultChecked={reward?.active ?? true} />
      </div>
      <div className="sm:col-span-2">
        <PendingButton>{reward ? "Salva premio" : "Crea premio"}</PendingButton>
      </div>
    </ActionForm>
  );
}

/**
 * Create or edit a category.
 *
 * `kind` is fixed after creation: moving "Ricette" from the news list to the
 * product list would silently re-file every post under it, and the slug
 * uniqueness is per kind — so the switch is a create-time decision.
 */
/**
 * Category editor.
 *
 * Product categories are pages on the storefront (`/negozio/categoria/<slug>`)
 * and colour the shop rail, so they carry colour, description, SEO and an
 * optional parent. News categories are only a label on the article — the blog
 * reads the name and nothing else — so they get name, slug, order and
 * visibility, and no fields that would silently go nowhere.
 */
export function CategoryForm({
  category,
  kind,
  parents = [],
  hasChildren = false,
}: {
  category?: CategoryRow | null;
  /** For a new category; ignored when editing (the row's own kind wins). */
  kind?: "product" | "post";
  /** Candidate parents: same kind, top level, excluding this row. */
  parents?: CategoryRow[];
  /** A category that already groups others stays top level (one level only). */
  hasChildren?: boolean;
}) {
  const fid = useFieldIds();
  const effectiveKind = category?.kind ?? kind ?? "product";
  const isProduct = effectiveKind === "product";

  return (
    <ActionForm
      action={saveCategory}
      redirectTo={`/admin/categories${isProduct ? "" : "?kind=post"}`}
      guardUnsaved="Le modifiche a questa categoria non sono state salvate. Se esci adesso vanno perse."
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {category && <input type="hidden" name="id" value={category.id} />}
      <input type="hidden" name="kind" value={effectiveKind} />

      <div>
        <label className={labelCls} htmlFor={fid("name")}>Nome</label>
        <input id={fid("name")} name="name" required maxLength={120} defaultValue={category?.name} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("slug")}>Slug</label>
        <input
          id={fid("slug")}
          name="slug"
          defaultValue={category?.slug}
          placeholder="auto dal nome se vuoto"
          className={inputCls}
        />
        <FieldError name="slug" />
        <p className="mt-1 text-xs text-brown-800/70">
          {isProduct
            ? "Usato nell'indirizzo pubblico: /negozio/categoria/<slug>."
            : "Identificativo interno; sul sito compare solo il nome."}
        </p>
      </div>

      {isProduct && (
        <div>
          <label className={labelCls} htmlFor={fid("parentId")}>Categoria superiore</label>
          {hasChildren ? (
            <>
              {/* No field at all: the server would refuse it, and a disabled
                  <select> is never posted anyway. */}
              <p className={`${inputCls} text-brown-800/70`}>— Nessuna (primo livello) —</p>
              <p className="mt-1 text-xs text-brown-800/70">
                Raggruppa già altre categorie, quindi resta al primo livello.
              </p>
            </>
          ) : (
            <>
              <select id={fid("parentId")} name="parentId" defaultValue={category?.parentId ?? ""} className={inputCls}>
                <option value="">— Nessuna (primo livello) —</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <FieldError name="parentId" />
              <p className="mt-1 text-xs text-brown-800/70">
                Solo per ordinare il gestionale: sul sito le categorie sono tutte allo stesso livello.
              </p>
            </>
          )}
        </div>
      )}
      <div>
        <label className={labelCls} htmlFor={fid("sortOrder")}>Ordine</label>
        <input
          id={fid("sortOrder")}
          name="sortOrder"
          type="number"
          defaultValue={category?.sortOrder ?? 0}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brown-800/70">
          Numero più basso = più in alto. Dall&apos;elenco puoi anche usare le frecce ↑ ↓.
        </p>
      </div>

      {isProduct && (
        <>
          <div>
            <label className={labelCls} htmlFor={fid("defaultVatRate")}>Aliquota IVA predefinita</label>
            <select
              id={fid("defaultVatRate")}
              name="defaultVatRate"
              defaultValue={
                category?.defaultVatRateBps != null ? String(category.defaultVatRateBps / 100) : ""
              }
              className={inputCls}
            >
              <option value="">— Nessuna —</option>
              {VAT_RATES_BPS.map((bps) => (
                <option key={bps} value={String(bps / 100)}>
                  {vatRateLabel(bps)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-brown-800/70">
              Proposta ai nuovi prodotti di questa categoria. Non cambia i prodotti già salvati.
            </p>
          </div>

          <div>
            <label className={labelCls} htmlFor={fid("accent")}>Colore</label>
            <select id={fid("accent")} name="accent" defaultValue={category?.accent ?? ""} className={inputCls}>
              <option value="">— Automatico (dal nome) —</option>
              {CATEGORY_ACCENTS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-brown-800/70">
              Il colore usato sul sito per questa categoria.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor={fid("description")}>Descrizione</label>
            <textarea
              id={fid("description")}
              name="description"
              rows={3}
              defaultValue={category?.description}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-brown-800/70">
              Mostrata in cima alla pagina della categoria sul sito.
            </p>
          </div>

          <div>
            <label className={labelCls} htmlFor={fid("seoTitle")}>Titolo SEO</label>
            <input id={fid("seoTitle")} name="seoTitle" maxLength={200} defaultValue={category?.seoTitle ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor={fid("seoDescription")}>Descrizione SEO</label>
            <input
              id={fid("seoDescription")}
              name="seoDescription"
              maxLength={400}
              defaultValue={category?.seoDescription ?? ""}
              className={inputCls}
            />
          </div>
        </>
      )}

      <div className="sm:col-span-2 flex flex-wrap items-center gap-6">
        <Toggle name="active" label="Mostra sul sito" defaultChecked={category?.active ?? true} />
      </div>
      <div className="sm:col-span-2">
        <PendingButton>{category ? "Salva categoria" : "Crea categoria"}</PendingButton>
      </div>
    </ActionForm>
  );
}
