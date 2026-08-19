"use client";

import { useRef, useState } from "react";
import { inputCls, labelCls } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { HoursEditor } from "./HoursEditor";
import { saveProduct, saveBlogPost, saveShop, saveReward } from "@/lib/admin/actions";
import { saveDiscount } from "@/lib/admin/discount-actions";
import { createUser } from "@/lib/admin/user-actions";
import { VAT_RATES_BPS, vatRateLabel } from "@/lib/fiscal";
import type { ProductRow, BlogPostRow, ShopRow, RewardRow, DiscountCodeRow } from "@/lib/db/schema";

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
  const [url, setUrl] = useState(current ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  // Clear both the URL and any picked file so a nullable image can be unset.
  function clearImage() {
    setUrl("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="sm:col-span-2">
      <label className={labelCls}>Immagine</label>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- simple admin preview
        <img src={url} alt="" className="mb-2 h-24 w-24 rounded-lg object-cover ring-1 ring-brown-900/10" />
      ) : null}
      <input
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
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="mt-2 block text-sm text-brown-800 file:mr-3 file:rounded-full file:border-0 file:bg-brown-900/10 file:px-4 file:py-2 file:text-xs file:font-bold file:tracking-widest file:uppercase hover:file:bg-brown-900/15"
      />
      <div className="mt-2 flex items-center gap-3">
        {url ? (
          <button
            type="button"
            onClick={clearImage}
            className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Rimuovi immagine
          </button>
        ) : null}
        <p className="text-xs text-brown-800/60">
          Carica JPG/PNG/WebP/AVIF (max 5 MB) oppure incolla un URL. Il file caricato ha la precedenza.
        </p>
      </div>
    </div>
  );
}

export function ProductForm({
  product,
  shops,
  categoryVat = {},
}: {
  product?: ProductRow | null;
  shops: ShopRow[];
  /** category → vatRateBps, derived from the catalogue (see getCategoryVatDefaults). */
  categoryVat?: Record<string, number>;
}) {
  // For a NEW product, typing a known category preselects the rate that category
  // already uses. An existing product keeps its stored rate — changing a saved
  // product's category must not silently restate its VAT.
  const [vatBps, setVatBps] = useState(product?.vatRateBps ?? 1000);
  const knownCategories = Object.keys(categoryVat);

  function onCategoryChange(value: string) {
    if (product) return;
    const suggested = categoryVat[value.trim()];
    if (suggested != null) setVatBps(suggested);
  }

  return (
    <ActionForm
      action={saveProduct}
      redirectTo="/admin/products"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {product && <input type="hidden" name="id" value={product.id} />}
      <div>
        <label className={labelCls}>Nome</label>
        <input name="name" required defaultValue={product?.name} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Slug</label>
        <input
          name="slug"
          defaultValue={product?.slug}
          placeholder="auto dal nome se vuoto"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Negozio</label>
        <select name="shopSlug" defaultValue={product?.shopSlug} className={inputCls}>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Categoria</label>
        <input
          name="category"
          list="product-categories"
          defaultValue={product?.category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className={inputCls}
        />
        <datalist id="product-categories">
          {knownCategories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Descrizione</label>
        <textarea name="description" rows={3} defaultValue={product?.description} className={inputCls} />
      </div>
      <ImageField current={product?.image} />
      <div>
        <label className={labelCls}>Etichetta immagine</label>
        <input name="imageLabel" defaultValue={product?.imageLabel} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Ordine</label>
        <input name="sortOrder" type="number" defaultValue={product?.sortOrder ?? 0} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Prezzo (€)</label>
        <input
          name="priceEuros"
          type="number"
          step="0.01"
          defaultValue={product?.priceCents != null ? (product.priceCents / 100).toFixed(2) : ""}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Unità (kg, pezzo…)</label>
        <input
          name="unit"
          defaultValue={product?.unit ?? ""}
          placeholder="auto: kg se venduto a peso"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Aliquota IVA</label>
        <select
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
        {!product && knownCategories.length > 0 && (
          <p className="mt-1 text-xs text-brown-800/60">
            Proposta in base alla categoria; puoi cambiarla.
          </p>
        )}
      </div>
      <div>
        <label className={labelCls}>Giacenza (vuoto = illimitata)</label>
        <input name="stock" type="number" min={0} defaultValue={product?.stock ?? ""} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Soglia di riordino</label>
        <input
          name="reorderPoint"
          type="number"
          min={0}
          defaultValue={product?.reorderPoint ?? ""}
          placeholder="vuoto = soglia generale"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Costo d&apos;acquisto (€, senza IVA)</label>
        <input
          name="costEuros"
          type="number"
          step="0.01"
          min={0}
          defaultValue={product?.costCents != null ? (product.costCents / 100).toFixed(2) : ""}
          placeholder="per il calcolo del margine"
          className={inputCls}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Codice / SKU</label>
          <input name="sku" defaultValue={product?.sku ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Fornitore</label>
          <input name="supplier" defaultValue={product?.supplier ?? ""} className={inputCls} />
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Provenienza / tracciabilità</label>
        <input
          name="origin"
          defaultValue={product?.origin ?? ""}
          placeholder="es. Suino nazionale — Marche"
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Allergeni (separati da virgola)</label>
        <input
          name="allergens"
          defaultValue={product?.allergens?.join(", ") ?? ""}
          placeholder="es. glutine, latte, frutta a guscio"
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Ingredienti</label>
        <textarea name="ingredients" rows={2} defaultValue={product?.ingredients ?? ""} className={inputCls} />
      </div>
      <div className="flex flex-wrap items-center gap-6 pt-6 sm:col-span-2">
        <Toggle name="purchasable" label="Acquistabile online" defaultChecked={product?.purchasable} />
        <Toggle name="soldByWeight" label="Venduto a peso" defaultChecked={product?.soldByWeight} />
        <Toggle name="featured" label="In evidenza" defaultChecked={product?.featured ?? true} />
        <Toggle name="active" label="Attivo" defaultChecked={product?.active ?? true} />
      </div>
      <div className="sm:col-span-2">
        <PendingButton>{product ? "Salva modifiche" : "Crea prodotto"}</PendingButton>
      </div>
    </ActionForm>
  );
}

export function BlogForm({ post }: { post?: BlogPostRow | null }) {
  return (
    <ActionForm
      action={saveBlogPost}
      redirectTo="/admin/blog"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {post && <input type="hidden" name="id" value={post.id} />}
      <div className="sm:col-span-2">
        <label className={labelCls}>Titolo</label>
        <input name="title" required defaultValue={post?.title} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Slug</label>
        <input name="slug" defaultValue={post?.slug} placeholder="auto se vuoto" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Data</label>
        <input name="date" type="date" defaultValue={post?.date} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Categoria</label>
        <input name="category" defaultValue={post?.category} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Ordine</label>
        <input name="sortOrder" type="number" defaultValue={post?.sortOrder ?? 0} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Estratto</label>
        <textarea name="excerpt" rows={2} defaultValue={post?.excerpt} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor="post-content">
          Contenuto (un paragrafo per riga vuota)
        </label>
        <textarea
          id="post-content"
          name="content"
          rows={8}
          defaultValue={post?.content?.join("\n\n")}
          className={inputCls}
        />
      </div>
      <ImageField current={post?.image} />
      <div>
        <label className={labelCls}>Etichetta immagine</label>
        <input name="imageLabel" defaultValue={post?.imageLabel} className={inputCls} />
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
      <div className="flex items-center pt-6 text-xs text-brown-800/60">
        Con una data futura l&apos;articolo resta nascosto fino a quel giorno.
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <PendingButton>{post ? "Salva modifiche" : "Crea news"}</PendingButton>
        {post && (
          <a
            href={`/blog/${post.slug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-brown-900/10 px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Vedi sul sito ↗
          </a>
        )}
      </div>
    </ActionForm>
  );
}

export function ShopForm({ shop }: { shop?: ShopRow | null }) {
  return (
    <ActionForm
      action={saveShop}
      redirectTo="/admin/shops"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {shop && <input type="hidden" name="id" value={shop.id} />}
      <div>
        <label className={labelCls}>Nome</label>
        <input name="name" required defaultValue={shop?.name} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Slug (identificativo URL)</label>
        <input
          name="slug"
          defaultValue={shop?.slug}
          placeholder="es. centro"
          readOnly={!!shop}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Specialità</label>
        <input name="specialty" defaultValue={shop?.specialty} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Ordine</label>
        <input name="sortOrder" type="number" defaultValue={shop?.sortOrder ?? 0} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Tagline</label>
        <input name="tagline" defaultValue={shop?.tagline} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Descrizione</label>
        <textarea name="description" rows={3} defaultValue={shop?.description} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Telefono</label>
        <input name="phone" defaultValue={shop?.phone} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Email</label>
        <input name="email" defaultValue={shop?.email} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Indirizzo</label>
        <input name="address" defaultValue={shop?.address} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <HoursEditor shop={shop} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Punti di forza (uno per riga)</label>
        <textarea name="highlights" rows={3} defaultValue={shop?.highlights.join("\n")} className={inputCls} />
      </div>
      <ImageField current={shop?.image} />
      <div>
        <label className={labelCls}>Etichetta immagine</label>
        <input name="imageLabel" defaultValue={shop?.imageLabel} className={inputCls} />
      </div>
      <div className="flex flex-wrap items-center gap-6 pt-6 sm:col-span-2">
        <Toggle name="addressConfirmed" label="Indirizzo confermato" defaultChecked={shop?.addressConfirmed ?? true} />
        <Toggle name="hoursConfirmed" label="Orari confermati" defaultChecked={shop?.hoursConfirmed ?? true} />
      </div>
      <div className="flex flex-wrap items-center gap-6 sm:col-span-2">
        <Toggle name="reservationsEnabled" label="Prenotazioni attive" defaultChecked={shop?.reservationsEnabled ?? true} />
        <Toggle name="storeEnabled" label="Ritiro in negozio (store)" defaultChecked={shop?.storeEnabled ?? true} />
        <Toggle name="porchettaEnabled" label="Porchetta del sabato" defaultChecked={shop?.porchettaEnabled ?? true} />
      </div>

      {/* Capacity is per location: the two shops prepare separately, and one
          may seat twice as many people as the other. */}
      <div>
        <label className={labelCls} htmlFor="shop-porchetta-kg">
          Capacità porchetta (kg al giorno)
        </label>
        <input
          id="shop-porchetta-kg"
          name="porchettaCapacityKg"
          type="number"
          min={0}
          defaultValue={shop?.porchettaCapacityKg ?? ""}
          placeholder="usa il valore generale"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brown-800/60">
          Vuoto: usa la capacità impostata in Impostazioni per tutte le sedi.
        </p>
      </div>
      <div>
        <label className={labelCls} htmlFor="shop-seats">
          Coperti per fascia oraria
        </label>
        <input
          id="shop-seats"
          name="seatsCapacity"
          type="number"
          min={0}
          defaultValue={shop?.seatsCapacity ?? ""}
          placeholder="nessun limite"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brown-800/60">
          Oltre questo numero di ospiti nella stessa fascia la prenotazione viene segnalata.
        </p>
      </div>
      <div className="sm:col-span-2">
        <PendingButton>{shop ? "Salva negozio" : "Crea negozio"}</PendingButton>
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
  // `value` is shown in its human form: whole percent, or euros for a fixed code.
  const valueDefault = discount
    ? discount.type === "fixed"
      ? (discount.value / 100).toFixed(2)
      : String(discount.value)
    : "";
  return (
    <ActionForm
      action={saveDiscount}
      redirectTo="/admin/discounts"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {discount && <input type="hidden" name="id" value={discount.id} />}
      <div>
        <label className={labelCls}>Codice</label>
        <input
          name="code"
          required
          defaultValue={discount?.code}
          placeholder="es. BENVENUTO10"
          className={`${inputCls} uppercase`}
        />
      </div>
      <div>
        <label className={labelCls}>Tipo</label>
        <select name="type" defaultValue={discount?.type ?? "percent"} className={inputCls}>
          <option value="percent">Percentuale (%)</option>
          <option value="fixed">Importo fisso (€)</option>
          <option value="free_shipping">Spedizione gratuita</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Valore (% o € — ignorato per spedizione gratuita)</label>
        <input name="value" type="number" step="0.01" min={0} defaultValue={valueDefault} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Spesa minima (€)</label>
        <input
          name="minSubtotalEuros"
          type="number"
          step="0.01"
          min={0}
          defaultValue={discount ? (discount.minSubtotalCents / 100).toFixed(2) : ""}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Utilizzi massimi (vuoto = illimitati)</label>
        <input name="maxRedemptions" type="number" min={1} defaultValue={discount?.maxRedemptions ?? ""} className={inputCls} />
      </div>
      {/* Scoping. Without these a code was all-or-nothing: one customer could
          use a "benvenuto" code every week, and a code meant for one shop
          worked at both. */}
      <div>
        <label className={labelCls}>Utilizzi per cliente (vuoto = illimitati)</label>
        <input
          name="maxPerCustomer"
          type="number"
          min={1}
          defaultValue={discount?.maxPerCustomer ?? ""}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Valido solo per la sede</label>
        <select name="shopSlug" defaultValue={discount?.shopSlug ?? ""} className={inputCls}>
          <option value="">Tutte le sedi</option>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Valido dal</label>
          <input name="startsAt" type="date" defaultValue={dateValue(discount?.startsAt)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Valido al</label>
          <input name="endsAt" type="date" defaultValue={dateValue(discount?.endsAt)} className={inputCls} />
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
export function UserForm() {
  return (
    <ActionForm
      action={createUser}
      redirectTo="/admin/users"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <div>
        <label className={labelCls}>Username</label>
        <input
          name="username"
          required
          minLength={3}
          maxLength={40}
          placeholder="es. mario.rossi"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Nome</label>
        <input name="name" required maxLength={200} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Email (facoltativa)</label>
        <input name="email" type="email" maxLength={200} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Ruolo</label>
        <select name="role" defaultValue="customer" className={inputCls}>
          <option value="customer">Cliente</option>
          <option value="staff">Staff</option>
          <option value="admin">Amministratore</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Password</label>
        <input
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
  return (
    <ActionForm
      action={saveReward}
      redirectTo="/admin/rewards"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {reward && <input type="hidden" name="id" value={reward.id} />}
      <div>
        <label className={labelCls}>Nome</label>
        <input name="name" required defaultValue={reward?.name} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Slug</label>
        <input name="slug" defaultValue={reward?.slug} placeholder="auto se vuoto" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Punti richiesti</label>
        <input name="points" type="number" min={0} required defaultValue={reward?.points ?? 0} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Ordine</label>
        <input name="sortOrder" type="number" defaultValue={reward?.sortOrder ?? 0} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Descrizione</label>
        <textarea name="description" rows={2} defaultValue={reward?.description} className={inputCls} />
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
        <p className="mt-1 text-xs text-brown-800/60">
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
        <p className="mt-1 text-xs text-brown-800/60">Quante volte lo stesso cliente può riscattarlo.</p>
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
      <div className="flex items-center pt-6">
        <Toggle name="active" label="Attivo" defaultChecked={reward?.active ?? true} />
      </div>
      <div className="sm:col-span-2">
        <PendingButton>{reward ? "Salva premio" : "Crea premio"}</PendingButton>
      </div>
    </ActionForm>
  );
}
