/**
 * Base-content seed (idempotent): shops, products, blog posts, rewards, default
 * settings and the bootstrap admin from `lib/data.ts`. Every insert is
 * ON CONFLICT DO NOTHING, so re-running never overwrites edits made in admin.
 *
 * Used by `scripts/seed.ts` (CLI / Docker entrypoint / Vercel build) and by
 * `lib/db/client.ts` to populate the ephemeral in-memory database when the app
 * runs on Vercel without a configured database (demo mode).
 *
 * Not `server-only` so the CLI script can import it.
 */
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import type { Db } from "./connection";
import { shops as seedShops, featuredProducts, blogPosts as seedPosts } from "../data";
import { hashPassword } from "../auth/password";
import { env } from "../env";

export async function seedBaseData(db: Db, log: (msg: string) => void = console.log): Promise<void> {
  // Shops
  for (const [i, s] of seedShops.entries()) {
    await db
      .insert(schema.shops)
      .values({
        slug: s.slug,
        name: s.name,
        specialty: s.specialty,
        tagline: s.tagline,
        description: s.description,
        address: s.address,
        addressConfirmed: s.addressConfirmed,
        hours: s.hours,
        hoursConfirmed: s.hoursConfirmed,
        phone: s.phone,
        email: s.email,
        highlights: s.highlights,
        imageLabel: s.imageLabel,
        image: s.image,
        sortOrder: i,
      })
      .onConflictDoNothing({ target: schema.shops.slug });
  }

  // Products — a couple are purchasable online out of the box.
  const commerce: Record<string, { priceCents: number; unit: string }> = {
    "porchetta-artigianale": { priceCents: 1900, unit: "kg" },
    "ciauscolo-igp": { priceCents: 450, unit: "etto" },
    "pecorino-di-fossa": { priceCents: 550, unit: "etto" },
  };
  for (const [i, p] of featuredProducts.entries()) {
    const c = commerce[p.slug];
    await db
      .insert(schema.products)
      .values({
        slug: p.slug,
        name: p.name,
        shopSlug: p.shopSlug,
        category: p.category,
        description: p.description,
        imageLabel: p.imageLabel,
        image: p.image,
        priceCents: c?.priceCents ?? null,
        unit: c?.unit ?? null,
        purchasable: !!c,
        featured: true,
        active: true,
        sortOrder: i,
      })
      .onConflictDoNothing({ target: schema.products.slug });
  }

  // Blog posts
  for (const [i, post] of seedPosts.entries()) {
    await db
      .insert(schema.blogPosts)
      .values({
        slug: post.slug,
        title: post.title,
        date: post.date,
        category: post.category,
        excerpt: post.excerpt,
        content: post.content,
        imageLabel: post.imageLabel,
        image: post.image ?? null,
        published: true,
        sortOrder: i,
      })
      .onConflictDoNothing({ target: schema.blogPosts.slug });
  }

  // Loyalty rewards (previously hardcoded in AccountArea)
  const rewards = [
    {
      slug: "tagliere-della-casa",
      name: "Tagliere della casa",
      points: 500,
      description: "Una selezione dei nostri migliori salumi e formaggi per 2 persone.",
      image:
        "https://images.unsplash.com/photo-1541529086526-db283c563270?auto=format&fit=crop&q=80&w=800",
    },
    {
      slug: "verdicchio-abbinamento",
      name: "Verdicchio in abbinamento",
      points: 850,
      description: "Una bottiglia di Verdicchio dei Castelli di Jesi selezionata dal nostro banco.",
      image:
        "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&q=80&w=800",
    },
    {
      slug: "porchetta-famiglia",
      name: "Porchetta per la famiglia",
      points: 1200,
      description: "1kg della nostra porchetta calda artigianale, pronta per te il sabato mattina.",
      image:
        "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&q=80&w=800",
    },
  ];
  for (const [i, r] of rewards.entries()) {
    await db
      .insert(schema.rewards)
      .values({ ...r, active: true, sortOrder: i })
      .onConflictDoNothing({ target: schema.rewards.slug });
  }

  // Settings defaults
  const defaultSettings: { key: string; value: unknown }[] = [
    { key: "loyalty.pointsPerEuro", value: 1 },
    { key: "porchetta.enabled", value: true },
    { key: "porchetta.day", value: "saturday" },
    { key: "porchetta.cutoffDay", value: "friday" },
    { key: "reservations.enabled", value: true },
    { key: "store.enabled", value: true },
    { key: "porchetta.weeklyCapacityKg", value: 0 },
    { key: "store.lowStockThreshold", value: 5 },
    // Read by the IVA report, the order-detail breakdown and the FatturaPA XML.
    { key: "store.shippingVatRate", value: 22 },
  ];
  for (const s of defaultSettings) {
    await db.insert(schema.settings).values(s).onConflictDoNothing({ target: schema.settings.key });
  }

  // Bootstrap admin
  const existingAdmin = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, env.admin.username))
    .limit(1);
  if (existingAdmin.length === 0) {
    await db.insert(schema.users).values({
      username: env.admin.username,
      name: env.admin.name,
      passwordHash: hashPassword(env.admin.password),
      role: "admin",
    });
    log(`✓ Seeded admin user: ${env.admin.username}`);
  }

  log("✓ Seed complete.");
}
