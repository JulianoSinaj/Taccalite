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
import { asc, desc, eq, sql } from "drizzle-orm";
import * as schema from "./schema";
import type { Db } from "./connection";
import { shops as seedShops, featuredProducts, blogPosts as seedPosts } from "../data";
import { hashPassword } from "../auth/password";
import { slugify } from "../slug-core";
import { env } from "../env";

/**
 * Give every category *name* in use a category *row*, and point the rows that
 * use it at that row.
 *
 * `products.category` and `blog_posts.category` are free text; the `categories`
 * table is what the storefront's filter rail is built from, reached through
 * `category_id`. Migration 0029 created that table from the names in use and
 * linked them — but a migration runs once, and every raw insert since (this
 * seed, `scripts/seed-demo.ts`) writes the name without the id. On any database
 * first seeded *after* 0029 that leaves `getProductCategories()` joining to
 * nothing, and `/negozio` renders no category filters at all — not even "Tutti".
 *
 * So the reconciliation lives here, after the rows exist, instead of in a
 * migration that new data arrives behind. It is idempotent and additive: a name
 * that already has a row keeps it, and a row already filed keeps its filing, so
 * categories, ordering and colours an operator set in the gestionale survive
 * every re-seed.
 */
export async function reconcileCategories(db: Db): Promise<void> {
  for (const kind of ["product", "post"] as const) {
    const table = kind === "product" ? schema.products : schema.blogPosts;

    // Most-used first. Before the taxonomy was a table the rail was effectively
    // in that order, and it is the order the shop is used to reading.
    const inUse = await db
      .select({ name: table.category, n: sql<number>`count(*)` })
      .from(table)
      .where(sql`trim(${table.category}) <> ''`)
      .groupBy(table.category)
      .orderBy(desc(sql`count(*)`), asc(table.category));
    if (inUse.length === 0) continue;

    const existing = await db
      .select({
        name: schema.categories.name,
        slug: schema.categories.slug,
        sortOrder: schema.categories.sortOrder,
      })
      .from(schema.categories)
      .where(eq(schema.categories.kind, kind));

    const known = new Set(existing.map((c) => c.name));
    const takenSlugs = new Set(existing.map((c) => c.slug));
    // Appended after whatever the operator has already arranged, never renumbering it.
    let nextOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), 0);

    for (const { name } of inUse) {
      if (known.has(name)) continue;
      // Two names can slugify to the same string ("Salumi" and "salumi!"); the
      // unique index is on (kind, slug), so the second one takes a suffix rather
      // than losing the insert to the conflict clause.
      const base = slugify(name) || "categoria";
      let slug = base;
      for (let i = 2; takenSlugs.has(slug); i++) slug = `${base}-${i}`;
      takenSlugs.add(slug);
      known.add(name);
      // No accent: `categoryAccent()` falls back to its keyword match, which is
      // the documented behaviour for a category nobody has coloured by hand.
      await db
        .insert(schema.categories)
        .values({ kind, name, slug, sortOrder: ++nextOrder })
        .onConflictDoNothing();
    }

    // Fill only the nulls — a row an operator has filed by hand is never moved,
    // even if its denormalised name disagrees.
    await db.run(
      sql`update ${table} set category_id = (
            select c.id from ${schema.categories} c
            where c.kind = ${kind} and c.name = ${table}.category
          )
          where category_id is null and trim(category) <> ''`,
    );
  }
}

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
        layout: post.layout,
        imageLabel: post.imageLabel,
        image: post.image ?? null,
        published: true,
        sortOrder: i,
      })
      .onConflictDoNothing({ target: schema.blogPosts.slug });
  }

  // Both tables now hold category *names*; turn those into rows and link them,
  // or the storefront's filter rail has nothing to join to. Must run after the
  // two loops above, since it reads what they inserted.
  await reconcileCategories(db);

  // Loyalty rewards (previously hardcoded in AccountArea)
  const rewards = [
    {
      slug: "tagliere-della-casa",
      name: "Tagliere della casa",
      points: 500,
      description: "Una selezione dei nostri migliori salumi e formaggi per 2 persone.",
      image: "/images/salumi-appesi-stagionatura.jpg",
    },
    {
      slug: "verdicchio-abbinamento",
      name: "Verdicchio in abbinamento",
      points: 850,
      description: "Una bottiglia di Verdicchio dei Castelli di Jesi selezionata dal nostro banco.",
      // No photograph of the bottle yet, and the dashboard already guards on
      // `reward.image` — better an honest blank than a hotlinked stock bottle
      // that is not the wine we actually hand over.
      image: "",
    },
    {
      slug: "porchetta-famiglia",
      name: "Porchetta per la famiglia",
      points: 1200,
      description: "1kg della nostra porchetta calda artigianale, pronta per te il sabato mattina.",
      image: "/images/gastronomia-teglie-forno.jpg",
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
    // Per pickup day, per shop. (The old `porchetta.weeklyCapacityKg` name is
    // still read as a fallback for installs seeded before the rename.)
    { key: "porchetta.capacityKgPerDay", value: 0 },
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
