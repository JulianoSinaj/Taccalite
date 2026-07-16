import { inputCls, labelCls, SubmitButton } from "./ui";
import { saveProduct, saveBlogPost, saveShop } from "@/lib/admin/actions";
import type { ProductRow, BlogPostRow, ShopRow } from "@/lib/db/schema";

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-brown-900">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 rounded accent-brown-950" />
      {label}
    </label>
  );
}

export function ProductForm({ product, shops }: { product?: ProductRow | null; shops: ShopRow[] }) {
  return (
    <form action={saveProduct} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      <div className="sm:col-span-2">
        <label className={labelCls}>URL immagine</label>
        <input name="image" defaultValue={product?.image} className={inputCls} />
      </div>
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
        <SubmitButton>{product ? "Salva modifiche" : "Crea prodotto"}</SubmitButton>
      </div>
    </form>
  );
}

export function BlogForm({ post }: { post?: BlogPostRow | null }) {
  return (
    <form action={saveBlogPost} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      <div className="sm:col-span-2">
        <label className={labelCls}>URL immagine</label>
        <input name="image" defaultValue={post?.image ?? ""} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Etichetta immagine</label>
        <input name="imageLabel" defaultValue={post?.imageLabel} className={inputCls} />
      </div>
      <div className="flex items-center pt-6">
        <Toggle name="published" label="Pubblicato" defaultChecked={post?.published ?? true} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>{post ? "Salva modifiche" : "Crea news"}</SubmitButton>
      </div>
    </form>
  );
}

export function ShopForm({ shop }: { shop: ShopRow }) {
  return (
    <form action={saveShop} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={shop.id} />
      <div>
        <label className={labelCls}>Nome</label>
        <input name="name" required defaultValue={shop.name} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Specialità</label>
        <input name="specialty" defaultValue={shop.specialty} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Tagline</label>
        <input name="tagline" defaultValue={shop.tagline} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Descrizione</label>
        <textarea name="description" rows={3} defaultValue={shop.description} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Telefono</label>
        <input name="phone" defaultValue={shop.phone} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Email</label>
        <input name="email" defaultValue={shop.email} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Indirizzo</label>
        <input name="address" defaultValue={shop.address} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Orari (una riga per fascia: Etichetta | Valore)</label>
        <textarea
          name="hours"
          rows={3}
          defaultValue={shop.hours.map((h) => `${h.label} | ${h.value}`).join("\n")}
          className={inputCls}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Punti di forza (uno per riga)</label>
        <textarea name="highlights" rows={3} defaultValue={shop.highlights.join("\n")} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>URL immagine</label>
        <input name="image" defaultValue={shop.image} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Etichetta immagine</label>
        <input name="imageLabel" defaultValue={shop.imageLabel} className={inputCls} />
      </div>
      <div className="flex items-center gap-6 pt-6">
        <Toggle name="addressConfirmed" label="Indirizzo confermato" defaultChecked={shop.addressConfirmed} />
        <Toggle name="hoursConfirmed" label="Orari confermati" defaultChecked={shop.hoursConfirmed} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>Salva negozio</SubmitButton>
      </div>
    </form>
  );
}
