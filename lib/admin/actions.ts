"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resolveSlug } from "@/lib/slug";
import { isLowStock } from "@/lib/inventory";
import {
  products,
  blogPosts,
  shops,
  rewards,
  redemptions,
  newsletterSubscribers,
  settings,
  stockMovements,
} from "@/lib/db/schema";
import { requireAdmin, requireRole } from "@/lib/auth/session";
import { getSetting } from "@/lib/db/queries";
import { addPoints } from "@/lib/loyalty";
import { sendMail } from "@/lib/mail/mailer";
import { saveUploadedImage } from "@/lib/media";
import { logAudit } from "@/lib/audit";
import { notifyBackInStock } from "@/lib/stock-notify";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import {
  parseForm,
  productInput,
  blogInput,
  shopInput,
  rewardInput,
  redemptionStatusInput,
  pointsInput,
  settingInput,
  stockAdjustInput,
} from "@/lib/validation/admin";

// Parse "Label | Value" lines into hours; blank-separated lines into a list.
function parseHours(raw?: string) {
  return (raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split("|");
      return { label: label.trim(), value: rest.join("|").trim() };
    });
}
function parseLines(raw?: string) {
  return (raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * If the form carried an uploaded image file (`imageFile`), store it on the
 * persisted volume and overwrite the `image` field with its served path. Call
 * AFTER the auth check. A blank/absent file leaves the pasted `image` URL as-is.
 */
async function applyImageUpload(fd: FormData): Promise<void> {
  const file = fd.get("imageFile");
  if (file instanceof File && file.size > 0) {
    try {
      fd.set("image", await saveUploadedImage(file));
    } catch (e) {
      throw new ActionError(e instanceof Error ? e.message : "Caricamento immagine non riuscito.");
    }
  }
}

// NB: reservation actions live in `lib/admin/reservation-actions.ts`.

// ── Products ─────────────────────────────────────────────────────────────────
export async function saveProduct(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    await applyImageUpload(fd);
    const d = parseForm(productInput, fd);
    // Restocking above the low-stock threshold via the editor clears the alert
    // stamp so a future dip can alert again.
    const threshold = await getSetting<number>("store.lowStockThreshold", 5);
    // Restocking above the product's own reorder point (or the shop default)
    // clears the alert stamp so a future dip can alert again.
    const clearLowStock =
      d.stock != null && !isLowStock({ stock: d.stock, reorderPoint: d.reorderPoint }, threshold);
    const values = {
      // A readable slug from the product name, so catalogue URLs are
      // /negozio/salame-di-cinta rather than a random id.
      slug: await resolveSlug({
        table: products,
        slugColumn: products.slug,
        idColumn: products.id,
        explicit: d.slug,
        fallbackText: d.name,
        excludeId: d.id,
      }),
      name: d.name,
      shopSlug: d.shopSlug,
      category: d.category ?? "",
      description: d.description ?? "",
      imageLabel: d.imageLabel ?? "",
      image: d.image ?? "",
      priceCents: d.priceEuros,
      // Something sold by weight is priced per kg unless told otherwise.
      unit: d.unit ?? (d.soldByWeight ? "kg" : null),
      vatRateBps: d.vatRate,
      soldByWeight: d.soldByWeight,
      // Allergens accepted as a comma/newline separated list, stored as an array.
      allergens: (d.allergens ?? "")
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      origin: d.origin ?? null,
      ingredients: d.ingredients ?? null,
      purchasable: d.purchasable,
      stock: d.stock,
      reorderPoint: d.reorderPoint,
      costCents: d.costEuros,
      sku: d.sku ?? null,
      supplier: d.supplier ?? null,
      ...(clearLowStock ? { lowStockNotifiedAt: null } : {}),
      featured: d.featured,
      active: d.active,
      sortOrder: d.sortOrder,
    };
    if (d.id) {
      // Detect an out-of-stock → available transition to trigger back-in-stock mail.
      const [prev] = await db
        .select({ stock: products.stock, name: products.name, slug: products.slug })
        .from(products)
        .where(eq(products.id, d.id))
        .limit(1);
      await db.update(products).set(values).where(eq(products.id, d.id));
      if (prev && (prev.stock ?? 0) <= 0 && d.stock != null && d.stock > 0) {
        await notifyBackInStock(d.id, prev.name, prev.slug);
      }
    } else {
      await db.insert(products).values(values);
    }
    revalidatePath("/admin/products");
    revalidatePath("/negozio");
    return ok(d.id ? "Prodotto salvato." : "Prodotto creato.");
  });
}

/** Quick list-row toggle: activate/deactivate a product. */
export async function toggleProductActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    const active = fd.get("active") === "true";
    await db.update(products).set({ active }).where(eq(products.id, id));
    revalidatePath("/admin/products");
    revalidatePath("/negozio");
    return ok(active ? "Prodotto attivato." : "Prodotto disattivato.");
  });
}

/** Quick list-row toggle: feature/unfeature a product. */
export async function toggleProductFeatured(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    const featured = fd.get("featured") === "true";
    await db.update(products).set({ featured }).where(eq(products.id, id));
    revalidatePath("/admin/products");
    revalidatePath("/negozio");
    return ok(featured ? "Prodotto messo in evidenza." : "Prodotto rimosso dalle evidenze.");
  });
}

export async function deleteProduct(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    await db.delete(products).where(eq(products.id, id));
    await logAudit({ actor, action: "product.delete", entity: "product", entityId: id, summary: `Prodotto eliminato (${id})` });
    revalidatePath("/admin/products");
    return ok("Prodotto eliminato.");
  });
}

/**
 * Adjust a product's stock by a signed delta and record a movement in the ledger.
 * Staff-permitted (in-shop inventory management). The product must already track
 * stock (stock not null). Restocking above the low-stock threshold clears the
 * alert stamp so a future dip can re-alert (the reset the order flow deferred).
 */
export async function adjustStock(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(stockAdjustInput, fd);

    const [product] = await db.select().from(products).where(eq(products.id, d.productId)).limit(1);
    if (!product) throw new ActionError("Prodotto non trovato.");
    if (product.stock == null) {
      throw new ActionError("Questo prodotto non traccia le scorte. Imposta prima una giacenza dalla scheda.");
    }

    const newStock = Math.max(0, product.stock + d.delta);
    const threshold = await getSetting<number>("store.lowStockThreshold", 5);
    const stillLow = isLowStock({ stock: newStock, reorderPoint: product.reorderPoint }, threshold);

    await db
      .update(products)
      .set({
        stock: newStock,
        // Clear the low-stock alert stamp when back above the reorder point.
        ...(stillLow ? {} : { lowStockNotifiedAt: null }),
      })
      .where(eq(products.id, d.productId));

    await db.insert(stockMovements).values({
      productId: d.productId,
      delta: d.delta,
      reason: d.reason ?? "",
      stockAfter: newStock,
      createdByUserId: actor.id,
    });

    // Back in stock: if it was out (0) and is now available, notify waitlisters.
    if (product.stock <= 0 && newStock > 0) {
      await notifyBackInStock(product.id, product.name, product.slug);
    }

    await logAudit({
      actor,
      action: "stock.adjust",
      entity: "product",
      entityId: d.productId,
      summary: `Giacenza ${product.name}: ${d.delta > 0 ? "+" : ""}${d.delta} → ${newStock}${d.reason ? ` (${d.reason})` : ""}`,
      meta: { delta: d.delta, stockAfter: newStock },
    });

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${d.productId}`);
    revalidatePath("/negozio");
    return ok(`Giacenza aggiornata: ${newStock}.`);
  });
}

/** First paragraph of a post, trimmed to a listing-friendly length. */
function excerptFrom(paragraphs: string[], max = 200): string {
  const first = paragraphs[0] ?? "";
  if (first.length <= max) return first;
  // Cut at the last word boundary before the limit so we don't split a word.
  const cut = first.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// ── Blog ─────────────────────────────────────────────────────────────────────
export async function saveBlogPost(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    await applyImageUpload(fd);
    const d = parseForm(blogInput, fd);
    const content = (d.content ?? "")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const values = {
      slug: await resolveSlug({
        table: blogPosts,
        slugColumn: blogPosts.slug,
        idColumn: blogPosts.id,
        explicit: d.slug,
        fallbackText: d.title,
        excludeId: d.id,
      }),
      title: d.title,
      date: d.date || new Date().toISOString().slice(0, 10),
      category: d.category ?? "",
      // A blank excerpt is derived from the opening paragraph, so a post always
      // has something to show in listings and link previews.
      excerpt: d.excerpt ?? excerptFrom(content),
      content,
      imageLabel: d.imageLabel ?? "",
      image: d.image ?? null,
      published: d.published,
      sortOrder: d.sortOrder,
    };
    if (d.id) {
      await db.update(blogPosts).set(values).where(eq(blogPosts.id, d.id));
    } else {
      await db.insert(blogPosts).values(values);
    }
    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    return ok(d.id ? "Articolo salvato." : "Articolo creato.");
  });
}

/** Quick list-row toggle: publish/hide a blog post. */
export async function toggleBlogPublished(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    const published = fd.get("published") === "true";
    await db.update(blogPosts).set({ published }).where(eq(blogPosts.id, id));
    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    return ok(published ? "Articolo pubblicato." : "Articolo nascosto.");
  });
}

export async function deleteBlogPost(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    await db.delete(blogPosts).where(eq(blogPosts.id, id));
    await logAudit({ actor, action: "blog.delete", entity: "blog_post", entityId: id, summary: `Articolo eliminato (${id})` });
    revalidatePath("/admin/blog");
    return ok("Articolo eliminato.");
  });
}

// ── Shops (create/delete are admin-only) ─────────────────────────────────────
export async function saveShop(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin(); // staff+ may edit; creating a NEW shop additionally requires admin (below)
    await applyImageUpload(fd);
    const d = parseForm(shopInput, fd);
    const values = {
      name: d.name,
      specialty: d.specialty ?? "",
      tagline: d.tagline ?? "",
      description: d.description ?? "",
      address: d.address ?? "",
      addressConfirmed: d.addressConfirmed,
      hours: parseHours(d.hours),
      hoursConfirmed: d.hoursConfirmed,
      phone: d.phone ?? "",
      email: d.email ?? "",
      highlights: parseLines(d.highlights),
      image: d.image ?? "",
      imageLabel: d.imageLabel ?? "",
      reservationsEnabled: d.reservationsEnabled,
      storeEnabled: d.storeEnabled,
      porchettaEnabled: d.porchettaEnabled,
      sortOrder: d.sortOrder,
    };
    if (d.id) {
      await db.update(shops).set(values).where(eq(shops.id, d.id));
    } else {
      await requireRole("admin");
      if (!d.slug) throw new ActionError("Slug obbligatorio per una nuova sede");
      await db.insert(shops).values({ ...values, slug: d.slug });
    }
    revalidatePath("/admin/shops");
    revalidatePath("/sedi");
    return ok(d.id ? "Sede salvata." : "Sede creata.");
  });
}

export async function deleteShop(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = (fd.get("id") ?? "").toString();
    try {
      await db.delete(shops).where(eq(shops.id, id));
    } catch {
      throw new ActionError(
        "Impossibile eliminare: la sede ha prodotti, ordini o prenotazioni collegati. Riassegnali prima.",
      );
    }
    await logAudit({ actor, action: "shop.delete", entity: "shop", entityId: id, summary: `Sede eliminata (${id})` });
    revalidatePath("/admin/shops");
    revalidatePath("/sedi");
    return ok("Sede eliminata.");
  });
}

// ── Rewards ──────────────────────────────────────────────────────────────────
export async function saveReward(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    await applyImageUpload(fd);
    const d = parseForm(rewardInput, fd);
    const values = {
      slug: await resolveSlug({
        table: rewards,
        slugColumn: rewards.slug,
        idColumn: rewards.id,
        explicit: d.slug,
        fallbackText: d.name,
        excludeId: d.id,
      }),
      name: d.name,
      description: d.description ?? "",
      points: d.points,
      image: d.image ?? null,
      active: d.active,
      sortOrder: d.sortOrder,
    };
    if (d.id) {
      await db.update(rewards).set(values).where(eq(rewards.id, d.id));
    } else {
      await db.insert(rewards).values(values);
    }
    revalidatePath("/admin/rewards");
    return ok(d.id ? "Premio salvato." : "Premio creato.");
  });
}

/** Quick list-row toggle: activate/deactivate a reward. */
export async function toggleRewardActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    const active = fd.get("active") === "true";
    await db.update(rewards).set({ active }).where(eq(rewards.id, id));
    revalidatePath("/admin/rewards");
    return ok(active ? "Premio attivato." : "Premio disattivato.");
  });
}

export async function deleteReward(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = (fd.get("id") ?? "").toString();
    await db.delete(rewards).where(eq(rewards.id, id));
    await logAudit({ actor, action: "reward.delete", entity: "reward", entityId: id, summary: `Premio eliminato (${id})` });
    revalidatePath("/admin/rewards");
    return ok("Premio eliminato.");
  });
}

// ── Loyalty ──────────────────────────────────────────────────────────────────
export async function adjustPoints(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    // Points are money-equivalent — restrict manual adjustment to full admins.
    const admin = await requireRole("admin");
    const d = parseForm(pointsInput, fd);
    // `applied` differs from the requested delta only when a debit was clamped at
    // zero — log what actually happened so the audit matches the ledger + balance.
    const { applied } = await addPoints(d.userId, d.delta, d.reason || "Rettifica manuale", admin.id);
    await logAudit({
      actor: admin,
      action: "loyalty.adjust",
      entity: "user",
      entityId: d.userId,
      summary: `Rettifica punti ${applied > 0 ? "+" : ""}${applied}${applied !== d.delta ? ` (richiesti ${d.delta})` : ""}${d.reason ? ` — ${d.reason}` : ""}`,
      meta: { delta: d.delta, applied, reason: d.reason },
    });
    revalidatePath("/admin/loyalty");
    return ok(
      applied === d.delta
        ? "Punti aggiornati."
        : `Punti aggiornati (applicati ${applied} — saldo non può scendere sotto zero).`,
    );
  });
}

export async function updateRedemptionStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(redemptionStatusInput, fd);
    const [redemption] = await db.select().from(redemptions).where(eq(redemptions.id, d.id)).limit(1);
    if (!redemption) throw new ActionError("Riscatto non trovato.");
    if (redemption.status === d.status) return ok("Nessuna modifica.");

    // Cancelling a redemption returns the spent points to the customer — exactly
    // once (guarded by the from-status), with its own ledger entry via addPoints.
    if (d.status === "cancelled" && redemption.status !== "cancelled") {
      await addPoints(
        redemption.userId,
        redemption.pointsSpent,
        `Riscatto annullato: ${redemption.rewardName}`,
        actor.id,
      );
    }

    await db
      .update(redemptions)
      .set({ status: d.status, fulfilledAt: d.status === "fulfilled" ? new Date() : null })
      .where(eq(redemptions.id, d.id));

    await logAudit({
      actor,
      action: "redemption.status",
      entity: "redemption",
      entityId: redemption.id,
      summary: `Riscatto "${redemption.rewardName}": ${redemption.status} → ${d.status}${
        d.status === "cancelled" ? ` (+${redemption.pointsSpent} punti restituiti)` : ""
      }`,
      meta: { from: redemption.status, to: d.status, pointsSpent: redemption.pointsSpent },
    });

    revalidatePath("/admin/loyalty");
    return ok("Riscatto aggiornato.");
  });
}

// ── Newsletter ───────────────────────────────────────────────────────────────
export async function removeSubscriber(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    await db
      .update(newsletterSubscribers)
      .set({ status: "unsubscribed" })
      .where(eq(newsletterSubscribers.id, (fd.get("id") ?? "").toString()));
    revalidatePath("/admin/newsletter");
    return ok("Iscritto rimosso.");
  });
}

// NB: broadcasts now go through `lib/admin/campaign-actions.ts` — every send is
// recorded as a campaign first, so it can be drafted, scheduled and reviewed.

// ── Email test ───────────────────────────────────────────────────────────────
export async function sendTestEmail(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const to = (fd.get("to") ?? "").toString().trim();
    if (!to) throw new ActionError("Inserisci un indirizzo email");
    await sendMail({
      to,
      subject: "Email di prova — Norcineria Taccalite",
      html: "<p>Questa è un'email di prova dalla piattaforma Taccalite. Se la ricevi, l'invio funziona.</p>",
      text: "Questa è un'email di prova dalla piattaforma Taccalite. Se la ricevi, l'invio funziona.",
    }).catch(() => {});
    revalidatePath("/admin/outbox");
    revalidatePath("/admin/settings");
    return ok("Email di prova inviata (controlla l'outbox).");
  });
}

// ── Settings (admin-only) ────────────────────────────────────────────────────
export async function saveSetting(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(settingInput, fd);
    let value: unknown = d.value;
    // Text settings are stored verbatim; everything else round-trips through JSON
    // so getSetting<number>/<boolean> keep working.
    if (d.valueType !== "text") {
      try {
        value = JSON.parse(d.value);
      } catch {
        /* keep as string */
      }
    }
    await db
      .insert(settings)
      .values({ key: d.key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
    await logAudit({
      actor,
      action: "setting.save",
      entity: "setting",
      entityId: d.key,
      summary: `Impostazione ${d.key} = ${d.value}`,
      meta: { key: d.key, value },
    });
    revalidatePath("/admin/settings");
    return ok("Impostazione salvata.");
  });
}
