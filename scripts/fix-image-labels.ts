/**
 * Realign `image` / `imageLabel` on the seeded products and blog posts with
 * lib/data.ts, and drop the hotlinked stock photos.
 *
 * Why this exists at all: `seedBaseData` inserts with `onConflictDoNothing`,
 * deliberately — a re-seed must never clobber what the shop typed into
 * /admin. The cost of that choice is that a *correction* to lib/data.ts never
 * reaches a database that has already been seeded, and the captions had drifted
 * badly: "Foto porchetta intera sul banco" was pointing at a photograph of raw
 * chicken and rabbit in their trays, and "Foto nuovo banco formaggi" at a bag
 * of spaghetti. Two rows still hotlinked images.unsplash.com, so a product page
 * and the loyalty dashboard were fetching a stranger's photo from a CDN nobody
 * here controls, on every render, and passing it off as ours.
 *
 * Scope is deliberately narrow: only the slugs that lib/data.ts seeds, only the
 * two image columns. Demo rows, prices, stock and anything the shop has written
 * are not touched.
 *
 * Dry run by default — prints what it would change and exits. Pass `--apply`
 * to write:
 *
 *   npx tsx scripts/fix-image-labels.ts            # show the diff
 *   npx tsx scripts/fix-image-labels.ts --apply    # write it
 */
import "./_bootstrap-env"; // MUST be first: defaults NODE_ENV before lib/env loads
import { eq } from "drizzle-orm";
import { openDatabase } from "../lib/db/connection";
import * as schema from "../lib/db/schema";
import { env } from "../lib/env";
import { featuredProducts, blogPosts } from "../lib/data";

/**
 * Rewards live inside `seedBaseData` rather than lib/data.ts, so the one row
 * that needs correcting is named here. Empty string, not a replacement photo:
 * `AccountDashboard` already guards on `reward.image`, and no bottle of ours
 * has been photographed yet.
 */
const REWARD_IMAGES: Record<string, string> = {
  "verdicchio-abbinamento": "",
};

const apply = process.argv.includes("--apply");

async function main() {
  const db = await openDatabase(env.databaseUrl, env.databaseAuthToken);
  let changed = 0;

  /** Report one field, and write it only when it actually differs. */
  async function reconcile(
    table: "products" | "blogPosts" | "rewards",
    slug: string,
    field: "image" | "imageLabel",
    want: string,
    got: string | null,
  ) {
    // `??` not `||`: a column that is legitimately empty must compare equal to
    // an intended empty string, or every run would report the same phantom diff.
    if ((got ?? "") === want) return;
    changed++;
    console.log(`  ${table}/${slug}.${field}`);
    console.log(`    - ${JSON.stringify(got)}`);
    console.log(`    + ${JSON.stringify(want)}`);
    if (!apply) return;

    if (table === "products") {
      await db
        .update(schema.products)
        .set({ [field]: want })
        .where(eq(schema.products.slug, slug));
    } else if (table === "blogPosts") {
      await db
        .update(schema.blogPosts)
        .set({ [field]: want })
        .where(eq(schema.blogPosts.slug, slug));
    } else {
      await db
        .update(schema.rewards)
        .set({ [field]: want })
        .where(eq(schema.rewards.slug, slug));
    }
  }

  console.log(apply ? "Applying:" : "Dry run (pass --apply to write):");

  for (const p of featuredProducts) {
    const row = await db.query.products.findFirst({
      where: eq(schema.products.slug, p.slug),
    });
    if (!row) continue;
    await reconcile("products", p.slug, "image", p.image, row.image);
    await reconcile("products", p.slug, "imageLabel", p.imageLabel, row.imageLabel);
  }

  for (const post of blogPosts) {
    const row = await db.query.blogPosts.findFirst({
      where: eq(schema.blogPosts.slug, post.slug),
    });
    if (!row) continue;
    await reconcile("blogPosts", post.slug, "image", post.image ?? "", row.image);
    await reconcile("blogPosts", post.slug, "imageLabel", post.imageLabel, row.imageLabel);
  }

  for (const [slug, image] of Object.entries(REWARD_IMAGES)) {
    const row = await db.query.rewards.findFirst({
      where: eq(schema.rewards.slug, slug),
    });
    if (!row) continue;
    await reconcile("rewards", slug, "image", image, row.image);
  }

  console.log(
    changed === 0
      ? "Nothing to do — the database already matches lib/data.ts."
      : `${changed} field(s) ${apply ? "updated" : "would change"}.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
