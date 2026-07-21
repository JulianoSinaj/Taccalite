"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import {
  reservations,
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
import { getShopBySlug, getSetting } from "@/lib/db/queries";
import { addPoints } from "@/lib/loyalty";
import { sendMail } from "@/lib/mail/mailer";
import { broadcastToSubscribers } from "@/lib/automation";
import { env } from "@/lib/env";
import {
  reservationStatusEmail,
  porchettaReadyEmail,
  newsletterBroadcast,
  type ReservationEmailData,
} from "@/lib/mail/templates";
import { saveUploadedImage } from "@/lib/media";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import {
  parseForm,
  productInput,
  blogInput,
  shopInput,
  rewardInput,
  reservationStatusInput,
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

/** Build a URL slug from free text: lowercase, accents stripped, spaces/other
 *  characters → hyphens, repeats collapsed, edges trimmed. May return "". */
function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop combining accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // spaces & non [a-z0-9] → hyphen
    .replace(/-+/g, "-") // collapse repeats
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

/** True if another blog post already uses this slug (ignoring the row `excludeId`). */
async function blogSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const rows = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, slug));
  return rows.some((r) => r.id !== excludeId);
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

// ── Reservations ─────────────────────────────────────────────────────────────
export async function updateReservationStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const data = parseForm(reservationStatusInput, fd);

    const [res] = await db.select().from(reservations).where(eq(reservations.id, data.id)).limit(1);
    if (!res) throw new ActionError("Prenotazione non trovata");

    await db
      .update(reservations)
      .set({ status: data.status, adminNotes: data.adminNotes ?? res.adminNotes, updatedAt: new Date() })
      .where(eq(reservations.id, data.id));

    if ((data.status === "confirmed" || data.status === "cancelled") && res.email) {
      const shop = await getShopBySlug(res.shopSlug);
      const emailData: ReservationEmailData = {
        reference: res.reference,
        type: res.type,
        name: res.name,
        phone: res.phone,
        email: res.email,
        date: res.date,
        time: res.time,
        guests: res.guests,
        quantityKg: res.quantityKg,
        shopName: shop?.name ?? res.shopSlug,
        notes: res.notes,
      };
      await sendMail({ to: res.email, ...reservationStatusEmail(emailData, data.status) }).catch(() => {});
    }
    revalidatePath("/admin/reservations");
    return ok("Prenotazione aggiornata.");
  });
}

/** Owner marks a porchetta pre-order ready and emails the customer. Idempotent. */
export async function markPorchettaReady(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const id = (fd.get("id") ?? "").toString();

    const [res] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
    if (!res) throw new ActionError("Prenotazione non trovata");
    if (res.type !== "porchetta") throw new ActionError("Disponibile solo per la porchetta.");
    if (res.readyAt) return ok("Avviso di ritiro già inviato.");
    if (!res.email) throw new ActionError("Nessuna email per questa prenotazione.");

    const shop = await getShopBySlug(res.shopSlug);
    const pickup = shop ? { name: shop.name, address: shop.address } : null;
    await sendMail({
      to: res.email,
      ...porchettaReadyEmail(res.name, res.date, res.quantityKg, pickup),
    }).catch(() => {});

    await db
      .update(reservations)
      .set({ readyAt: new Date(), updatedAt: new Date() })
      .where(eq(reservations.id, id));

    revalidatePath("/admin/reservations/agenda");
    revalidatePath("/admin/reservations");
    return ok("Avviso di ritiro inviato.");
  });
}

/** Owner confirms a waitlisted porchetta order (removes it from the waitlist). */
export async function promoteFromWaitlist(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const id = (fd.get("id") ?? "").toString();

    const [res] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
    if (!res) throw new ActionError("Prenotazione non trovata");

    await db
      .update(reservations)
      .set({ waitlisted: false, updatedAt: new Date() })
      .where(eq(reservations.id, id));

    revalidatePath("/admin/reservations");
    revalidatePath("/admin/reservations/agenda");
    return ok("Prenotazione confermata dalla lista d'attesa.");
  });
}

// ── Products ─────────────────────────────────────────────────────────────────
export async function saveProduct(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    await applyImageUpload(fd);
    const d = parseForm(productInput, fd);
    // Restocking above the low-stock threshold via the editor clears the alert
    // stamp so a future dip can alert again.
    const threshold = await getSetting<number>("store.lowStockThreshold", 5);
    const clearLowStock = d.stock != null && d.stock > threshold;
    const values = {
      slug: d.slug || nanoid(8),
      name: d.name,
      shopSlug: d.shopSlug,
      category: d.category ?? "",
      description: d.description ?? "",
      imageLabel: d.imageLabel ?? "",
      image: d.image ?? "",
      priceCents: d.priceEuros,
      unit: d.unit ?? null,
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
      ...(clearLowStock ? { lowStockNotifiedAt: null } : {}),
      featured: d.featured,
      active: d.active,
      sortOrder: d.sortOrder,
    };
    if (d.id) {
      await db.update(products).set(values).where(eq(products.id, d.id));
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

    await db
      .update(products)
      .set({
        stock: newStock,
        // Clear the low-stock alert stamp when back above the threshold.
        ...(newStock > threshold ? { lowStockNotifiedAt: null } : {}),
      })
      .where(eq(products.id, d.productId));

    await db.insert(stockMovements).values({
      productId: d.productId,
      delta: d.delta,
      reason: d.reason ?? "",
      stockAfter: newStock,
      createdByUserId: actor.id,
    });

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
    // Prefer a readable slug derived from the title; fall back to a short random
    // suffix only when the title yields nothing usable or the slug is taken.
    let slug = d.slug;
    if (!slug) {
      const base = slugify(d.title);
      slug = base && !(await blogSlugTaken(base, d.id)) ? base : `${base ? `${base}-` : ""}${nanoid(6)}`;
    }
    const values = {
      slug,
      title: d.title,
      date: d.date || new Date().toISOString().slice(0, 10),
      category: d.category ?? "",
      excerpt: d.excerpt ?? "",
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
    revalidatePath("/negozi");
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
    revalidatePath("/negozi");
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
      slug: d.slug || nanoid(8),
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
    await addPoints(d.userId, d.delta, d.reason || "Rettifica manuale", admin.id);
    await logAudit({
      actor: admin,
      action: "loyalty.adjust",
      entity: "user",
      entityId: d.userId,
      summary: `Rettifica punti ${d.delta > 0 ? "+" : ""}${d.delta}${d.reason ? ` — ${d.reason}` : ""}`,
      meta: { delta: d.delta, reason: d.reason },
    });
    revalidatePath("/admin/loyalty");
    return ok("Punti aggiornati.");
  });
}

export async function updateRedemptionStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const d = parseForm(redemptionStatusInput, fd);
    await db
      .update(redemptions)
      .set({ status: d.status, fulfilledAt: d.status === "fulfilled" ? new Date() : null })
      .where(eq(redemptions.id, d.id));
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

/** Convert the admin's plaintext message into the broadcast body HTML: blank
 *  lines become paragraphs, single newlines become <br>. */
function broadcastBodyHtml(bodyText: string): string {
  return bodyText
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

export async function sendBroadcast(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const subject = (fd.get("subject") ?? "").toString().trim();
    const bodyText = (fd.get("body") ?? "").toString().trim();
    const source = (fd.get("source") ?? "").toString().trim();
    if (!subject || !bodyText) throw new ActionError("Oggetto e testo sono obbligatori");
    const bodyHtml = broadcastBodyHtml(bodyText);
    const { queued, sent } = await broadcastToSubscribers(
      subject,
      bodyHtml,
      source ? { source } : {},
    );
    revalidatePath("/admin/newsletter");
    revalidatePath("/admin/outbox");
    return ok(
      `Newsletter accodata per ${queued} iscritti${sent ? ` (${sent} già inviate)` : ""}.`,
    );
  });
}

/** Send the composed subject + body as a single preview email to the owner, so
 *  it can be reviewed before the real broadcast. Uses a dummy unsubscribe URL. */
export async function sendTestBroadcast(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const subject = (fd.get("subject") ?? "").toString().trim();
    const bodyText = (fd.get("body") ?? "").toString().trim();
    if (!subject || !bodyText) throw new ActionError("Oggetto e testo sono obbligatori");
    const bodyHtml = broadcastBodyHtml(bodyText);
    await sendMail({
      to: env.ownerEmail,
      ...newsletterBroadcast(`[PROVA] ${subject}`, bodyHtml, "#"),
    });
    revalidatePath("/admin/outbox");
    return ok(`Email di prova inviata a ${env.ownerEmail}.`);
  });
}

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
