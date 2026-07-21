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
} from "@/lib/db/schema";
import { requireAdmin, requireRole } from "@/lib/auth/session";
import { getShopBySlug } from "@/lib/db/queries";
import { addPoints } from "@/lib/loyalty";
import { sendMail } from "@/lib/mail/mailer";
import { broadcastToSubscribers } from "@/lib/automation";
import { reservationStatusEmail, type ReservationEmailData } from "@/lib/mail/templates";
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

// ── Products ─────────────────────────────────────────────────────────────────
export async function saveProduct(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const d = parseForm(productInput, fd);
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
      purchasable: d.purchasable,
      stock: d.stock,
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

export async function deleteProduct(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    await db.delete(products).where(eq(products.id, (fd.get("id") ?? "").toString()));
    revalidatePath("/admin/products");
    return ok("Prodotto eliminato.");
  });
}

// ── Blog ─────────────────────────────────────────────────────────────────────
export async function saveBlogPost(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const d = parseForm(blogInput, fd);
    const content = (d.content ?? "")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const values = {
      slug: d.slug || nanoid(8),
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

export async function deleteBlogPost(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    await db.delete(blogPosts).where(eq(blogPosts.id, (fd.get("id") ?? "").toString()));
    revalidatePath("/admin/blog");
    return ok("Articolo eliminato.");
  });
}

// ── Shops (create/delete are admin-only) ─────────────────────────────────────
export async function saveShop(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
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
      await requireAdmin();
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
    await requireRole("admin");
    try {
      await db.delete(shops).where(eq(shops.id, (fd.get("id") ?? "").toString()));
    } catch {
      throw new ActionError(
        "Impossibile eliminare: la sede ha prodotti, ordini o prenotazioni collegati. Riassegnali prima.",
      );
    }
    revalidatePath("/admin/shops");
    revalidatePath("/negozi");
    return ok("Sede eliminata.");
  });
}

// ── Rewards ──────────────────────────────────────────────────────────────────
export async function saveReward(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
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

export async function deleteReward(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    await db.delete(rewards).where(eq(rewards.id, (fd.get("id") ?? "").toString()));
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

export async function sendBroadcast(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const subject = (fd.get("subject") ?? "").toString().trim();
    const bodyText = (fd.get("body") ?? "").toString().trim();
    if (!subject || !bodyText) throw new ActionError("Oggetto e testo sono obbligatori");
    const bodyHtml = bodyText
      .split(/\n{2,}/)
      .map(
        (p) =>
          `<p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`,
      )
      .join("");
    const { sent } = await broadcastToSubscribers(subject, bodyHtml);
    revalidatePath("/admin/newsletter");
    revalidatePath("/admin/outbox");
    return ok(`Newsletter inviata a ${sent} iscritti.`);
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
    await requireRole("admin");
    const d = parseForm(settingInput, fd);
    let value: unknown = d.value;
    try {
      value = JSON.parse(d.value);
    } catch {
      /* keep as string */
    }
    await db
      .insert(settings)
      .values({ key: d.key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
    revalidatePath("/admin/settings");
    return ok("Impostazione salvata.");
  });
}
