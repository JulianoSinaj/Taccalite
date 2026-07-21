"use client";

import { useRef, useState } from "react";
import { inputCls, labelCls } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { saveProduct, saveBlogPost, saveShop, saveReward } from "@/lib/admin/actions";
import type { ProductRow, BlogPostRow, ShopRow, RewardRow } from "@/lib/db/schema";

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

export function ProductForm({ product, shops }: { product?: ProductRow | null; shops: ShopRow[] }) {
  return (
    <ActionForm action={saveProduct} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div>
        <label className={labelCls}>Nome</label>
        <input name="name" required defaultValue={product?.name} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Slug</label>
        <input name="slug" defaultValue={product?.slug} placeholder="auto se vuoto" className={inputCls} />
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
        <input name="category" defaultValue={product?.category} className={inputCls} />
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
        <input name="unit" defaultValue={product?.unit ?? ""} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Giacenza (vuoto = illimitata)</label>
        <input name="stock" type="number" defaultValue={product?.stock ?? ""} className={inputCls} />
      </div>
      <div className="flex items-center gap-6 pt-6">
        <Toggle name="purchasable" label="Acquistabile online" defaultChecked={product?.purchasable} />
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
    <ActionForm action={saveBlogPost} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <label className={labelCls}>Contenuto (un paragrafo per riga vuota)</label>
        <textarea name="content" rows={8} defaultValue={post?.content?.join("\n\n")} className={inputCls} />
      </div>
      <ImageField current={post?.image} />
      <div>
        <label className={labelCls}>Etichetta immagine</label>
        <input name="imageLabel" defaultValue={post?.imageLabel} className={inputCls} />
      </div>
      <div className="flex items-center pt-6">
        <Toggle name="published" label="Pubblicato" defaultChecked={post?.published ?? true} />
      </div>
      <div className="sm:col-span-2">
        <PendingButton>{post ? "Salva modifiche" : "Crea news"}</PendingButton>
      </div>
    </ActionForm>
  );
}

export function ShopForm({ shop }: { shop?: ShopRow | null }) {
  return (
    <ActionForm action={saveShop} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <label className={labelCls}>Orari (una riga per fascia: Etichetta | Valore)</label>
        <textarea
          name="hours"
          rows={3}
          defaultValue={shop?.hours.map((h) => `${h.label} | ${h.value}`).join("\n")}
          className={inputCls}
        />
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
      <div className="sm:col-span-2">
        <PendingButton>{shop ? "Salva negozio" : "Crea negozio"}</PendingButton>
      </div>
    </ActionForm>
  );
}

export function RewardForm({ reward }: { reward?: RewardRow | null }) {
  return (
    <ActionForm action={saveReward} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
