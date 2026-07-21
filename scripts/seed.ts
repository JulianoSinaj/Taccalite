/**
 * Seed the database from lib/data.ts (idempotent).
 *
 * Standalone: opens its own connection (does not import the server-only client),
 * applies migrations, then upserts content, rewards, settings, and a bootstrap
 * admin. Run: `npm run db:seed`.
 */
import "./_bootstrap-env"; // MUST be first: defaults NODE_ENV before lib/env loads
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { shops as seedShops, featuredProducts, blogPosts as seedPosts } from "../lib/data";
import { hashPassword } from "../lib/auth/password";
import { env } from "../lib/env";

const dbPath = resolve(process.cwd(), env.databaseUrl);
if (!existsSync(dirname(dbPath))) mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });

async function main() {
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
    console.log(`✓ Seeded admin user: ${env.admin.username}`);
  }

  console.log("✓ Seed complete.");
}

main()
  .then(() => sqlite.close())
  .catch((err) => {
    console.error(err);
    sqlite.close();
    process.exit(1);
  });
