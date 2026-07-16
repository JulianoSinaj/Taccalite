"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { reservations, products, blogPosts, shops, redemptions, newsletterSubscribers, settings } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { getShopBySlug } from "@/lib/db/queries";
import { addPoints } from "@/lib/loyalty";
import { sendMail } from "@/lib/mail/mailer";
import { broadcastToSubscribers } from "@/lib/automation";
import { reservationStatusEmail, type ReservationEmailData } from "@/lib/mail/templates";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();
const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === "" ? null : Number(v);
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

// ── Reservations ─────────────────────────────────────────────────────────────
export async function updateReservationStatus(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status") as "pending" | "confirmed" | "completed" | "cancelled";
  const adminNotes = str(fd, "adminNotes");

  const [res] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  if (!res) return;

  await db
    .update(reservations)
    .set({ status, adminNotes: adminNotes || res.adminNotes, updatedAt: new Date() })
    .where(eq(reservations.id, id));

  // Notify the customer on confirm/cancel if we have their email.
  if ((status === "confirmed" || status === "cancelled") && res.email) {
    const shop = await getShopBySlug(res.shopSlug);
    const data: ReservationEmailData = {
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
    await sendMail({ to: res.email, ...reservationStatusEmail(data, status) }).catch(() => {});
  }
  revalidatePath("/admin/reservations");
}

// ── Products ─────────────────────────────────────────────────────────────────
export async function saveProduct(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const values = {
    slug: str(fd, "slug") || nanoid(8),
    name: str(fd, "name"),
    shopSlug: str(fd, "shopSlug"),
    category: str(fd, "category"),
    description: str(fd, "description"),
    imageLabel: str(fd, "imageLabel"),
    image: str(fd, "image"),
    priceCents: num(fd, "priceEuros") != null ? Math.round((num(fd, "priceEuros") as number) * 100) : null,
    unit: str(fd, "unit") || null,
    purchasable: bool(fd, "purchasable"),
    stock: num(fd, "stock"),
    featured: bool(fd, "featured"),
    active: bool(fd, "active"),
    sortOrder: num(fd, "sortOrder") ?? 0,
  };
  if (id) {
    await db.update(products).set(values).where(eq(products.id, id));
  } else {
    await db.insert(products).values(values);
  }
  revalidatePath("/admin/products");
}

export async function deleteProduct(fd: FormData) {
  await requireAdmin();
  await db.delete(products).where(eq(products.id, str(fd, "id")));
  revalidatePath("/admin/products");
}

// ── Blog ─────────────────────────────────────────────────────────────────────
export async function saveBlogPost(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const content = str(fd, "content")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const values = {
    slug: str(fd, "slug") || nanoid(8),
    title: str(fd, "title"),
    date: str(fd, "date") || new Date().toISOString().slice(0, 10),
    category: str(fd, "category"),
    excerpt: str(fd, "excerpt"),
    content,
    imageLabel: str(fd, "imageLabel"),
    image: str(fd, "image") || null,
    published: bool(fd, "published"),
    sortOrder: num(fd, "sortOrder") ?? 0,
  };
  if (id) {
    await db.update(blogPosts).set(values).where(eq(blogPosts.id, id));
  } else {
    await db.insert(blogPosts).values(values);
  }
  revalidatePath("/admin/blog");
}

export async function deleteBlogPost(fd: FormData) {
  await requireAdmin();
  await db.delete(blogPosts).where(eq(blogPosts.id, str(fd, "id")));
  revalidatePath("/admin/blog");
}

// ── Shops ────────────────────────────────────────────────────────────────────
export async function saveShop(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  // Hours: one "Label | Value" per line.
  const hours = str(fd, "hours")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split("|");
      return { label: label.trim(), value: rest.join("|").trim() };
    });
  const highlights = str(fd, "highlights")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  await db
    .update(shops)
    .set({
      name: str(fd, "name"),
      specialty: str(fd, "specialty"),
      tagline: str(fd, "tagline"),
      description: str(fd, "description"),
      address: str(fd, "address"),
      addressConfirmed: bool(fd, "addressConfirmed"),
      hours,
      hoursConfirmed: bool(fd, "hoursConfirmed"),
      phone: str(fd, "phone"),
      email: str(fd, "email"),
      highlights,
      image: str(fd, "image"),
      imageLabel: str(fd, "imageLabel"),
    })
    .where(eq(shops.id, id));
  revalidatePath("/admin/shops");
  revalidatePath("/negozi");
}

// ── Loyalty ──────────────────────────────────────────────────────────────────
export async function adjustPoints(fd: FormData) {
  const admin = await requireAdmin();
  const userId = str(fd, "userId");
  const delta = Number(str(fd, "delta"));
  const reason = str(fd, "reason") || "Rettifica manuale";
  if (!userId || !Number.isFinite(delta) || delta === 0) return;
  await addPoints(userId, delta, reason, admin.id);
  revalidatePath("/admin/loyalty");
}

export async function updateRedemptionStatus(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status") as "pending" | "fulfilled" | "cancelled";
  await db
    .update(redemptions)
    .set({ status, fulfilledAt: status === "fulfilled" ? new Date() : null })
    .where(eq(redemptions.id, id));
  revalidatePath("/admin/loyalty");
}

// ── Newsletter ───────────────────────────────────────────────────────────────
export async function removeSubscriber(fd: FormData) {
  await requireAdmin();
  await db
    .update(newsletterSubscribers)
    .set({ status: "unsubscribed" })
    .where(eq(newsletterSubscribers.id, str(fd, "id")));
  revalidatePath("/admin/newsletter");
}

// ── Email test ───────────────────────────────────────────────────────────────
export async function sendTestEmail(fd: FormData) {
  await requireAdmin();
  const to = str(fd, "to");
  if (!to) return;
  await sendMail({
    to,
    subject: "Email di prova — Norcineria Taccalite",
    html: "<p>Questa è un'email di prova dalla piattaforma Taccalite. Se la ricevi, l'invio funziona.</p>",
    text: "Questa è un'email di prova dalla piattaforma Taccalite. Se la ricevi, l'invio funziona.",
  }).catch(() => {});
  revalidatePath("/admin/outbox");
  revalidatePath("/admin/settings");
}

// ── Newsletter broadcast ─────────────────────────────────────────────────────
export async function sendBroadcast(fd: FormData) {
  await requireAdmin();
  const subject = str(fd, "subject");
  const bodyText = str(fd, "body");
  if (!subject || !bodyText) return;
  // Convert plain-text paragraphs to simple HTML.
  const bodyHtml = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 14px;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  await broadcastToSubscribers(subject, bodyHtml);
  revalidatePath("/admin/newsletter");
  revalidatePath("/admin/outbox");
}

// ── Settings ─────────────────────────────────────────────────────────────────
export async function saveSetting(fd: FormData) {
  await requireAdmin();
  const key = str(fd, "key");
  const raw = str(fd, "value");
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    /* keep as string */
  }
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  revalidatePath("/admin/settings");
}
