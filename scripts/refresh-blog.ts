/**
 * Push the rewritten diary in `lib/data.ts` into a database that has already
 * been seeded, and create the posts that did not exist before.
 *
 * Why this exists, again: `seedBaseData` inserts with `onConflictDoNothing`,
 * deliberately — a re-seed must never clobber what the shop typed into /admin.
 * The cost is that an *edit* to `lib/data.ts` never reaches a database that has
 * already been seeded, which is exactly the situation the three original posts
 * were in: two sentences each, no photographs in the body, no template. Same
 * shape and same reasoning as `scripts/fix-image-labels.ts`.
 *
 * The safety rule is the one thing to understand before running it:
 *
 *   **a post whose body the shop has edited is left alone.** A row only gets
 *   the new text if its stored `content` is byte-for-byte the seed's old text —
 *   the two-paragraph stubs listed in `ORIGINAL_CONTENT` below. Anything else is
 *   somebody's writing, and this script has no business overwriting it. Pass
 *   `--force` to overwrite anyway, which is for a demo database and nothing
 *   else.
 *
 * `--demo` does the same for the fourteen `demo-` fixtures from
 * `lib/db/demo-blog.ts`. They need their own path because re-running
 * `db:seed:demo` would not touch them (`onConflictDoNothing`) and
 * `db:seed:demo --reset` would regenerate the whole demo shop — four hundred
 * audit rows and every demo order — to restate fourteen articles. Dates,
 * ordering and the draft/published mix are left exactly as they are.
 *
 * Dry run by default — prints what it would do and exits:
 *
 *   npx tsx scripts/refresh-blog.ts             # show the plan
 *   npx tsx scripts/refresh-blog.ts --apply     # write it
 *   npx tsx scripts/refresh-blog.ts --apply --force   # overwrite edited posts too
 *   npx tsx scripts/refresh-blog.ts --demo --apply    # the demo fixtures instead
 */
import "./_bootstrap-env"; // MUST be first: defaults NODE_ENV before lib/env loads
import { eq } from "drizzle-orm";
import { openDatabase } from "../lib/db/connection";
import * as schema from "../lib/db/schema";
import { reconcileCategories } from "../lib/db/seed-data";
import { env } from "../lib/env";
import { blogPosts } from "../lib/data";
import { DEMO_BLOG_TITLES, demoBlogPost } from "../lib/db/demo-blog";

/**
 * The bodies the three original posts shipped with, verbatim.
 *
 * A post still holding one of these has never been touched by anyone, so
 * replacing it loses nothing. Keyed by slug; a post not listed here (the photo
 * essay, which is new) is simply created.
 */
const ORIGINAL_CONTENT: Record<string, string[]> = {
  "porchetta-del-sabato": [
    "Ogni sabato mattina, il profumo della porchetta appena cotta invade il negozio di Piazza Kennedy. È un appuntamento che si tramanda in famiglia da generazioni, e che continua a richiamare habitué e curiosi.",
    "Per evitare la fila, è possibile prenotare la propria porchetta direttamente al negozio o telefonicamente entro il venerdì.",
  ],
  "nuovi-formaggi-stagionati": [
    "Il nostro banco formaggi si arricchisce di nuove selezioni: taleggio, gorgonzola, roquefort e la delicata nuvola di capra, da abbinare alle nostre confetture e ai mieli in bottega.",
    "Passate a trovarci in Piazza Kennedy per una degustazione guidata dal nostro staff.",
  ],
  "orari-festivi": [
    "In occasione delle prossime festività, i nostri negozi osserveranno orari straordinari.",
    "Vi invitiamo a consultare questa pagina per gli aggiornamenti, o a contattarci direttamente.",
  ],
};

const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");
const demo = process.argv.includes("--demo");

function sameBody(a: string[] | null | undefined, b: string[]): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b);
}

async function main() {
  // `migrate: true` because this script depends on a column an older database
  // does not have (`blog_posts.layout`, migration 0045). Idempotent, and the
  // same call `scripts/seed.ts` makes.
  const db = await openDatabase(env.databaseUrl, env.databaseAuthToken, { migrate: true });
  let created = 0;
  let updated = 0;
  let skipped = 0;

  console.log(apply ? "Applying:" : "Dry run (pass --apply to write):");

  if (demo) {
    for (let i = 0; i < DEMO_BLOG_TITLES.length; i++) {
      const fixture = demoBlogPost(i);
      const row = await db.query.blogPosts.findFirst({
        where: eq(schema.blogPosts.slug, fixture.slug),
      });
      // Only rows this seeder created. A demo database that has never been
      // seeded has nothing to refresh, and `db:seed:demo` is the way to get it.
      if (!row) {
        skipped++;
        continue;
      }
      updated++;
      console.log(
        `  ~ demo    ${fixture.slug}  (${row.content?.length ?? 0} → ${fixture.content.length} blocchi, ${fixture.layout})`,
      );
      if (apply) {
        await db
          .update(schema.blogPosts)
          .set({
            title: fixture.title,
            category: fixture.category,
            excerpt: fixture.excerpt,
            content: fixture.content,
            layout: fixture.layout,
            imageLabel: fixture.imageLabel,
            image: fixture.image,
          })
          .where(eq(schema.blogPosts.id, row.id));
      }
    }
    if (apply) await reconcileCategories(db);
    console.log(
      updated === 0
        ? "No demo posts found — run `npm run db:seed:demo` first."
        : `${updated} demo post(s) ${apply ? "updated" : "would change"}, ${skipped} not present.`,
    );
    db.$client.close();
    return;
  }

  for (const [i, post] of blogPosts.entries()) {
    const row = await db.query.blogPosts.findFirst({
      where: eq(schema.blogPosts.slug, post.slug),
    });

    if (!row) {
      created++;
      console.log(`  + create  ${post.slug}  (${post.layout}, ${post.content.length} blocchi)`);
      if (apply) {
        await db.insert(schema.blogPosts).values({
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
        });
      }
      continue;
    }

    const untouched = sameBody(row.content, ORIGINAL_CONTENT[post.slug] ?? []);
    if (!untouched && !force) {
      skipped++;
      console.log(`  · skip    ${post.slug}  (testo modificato in /admin — usa --force per sovrascrivere)`);
      continue;
    }

    updated++;
    console.log(
      `  ~ update  ${post.slug}  (${row.content?.length ?? 0} → ${post.content.length} blocchi, layout ${row.layout} → ${post.layout})`,
    );
    if (apply) {
      await db
        .update(schema.blogPosts)
        .set({
          title: post.title,
          category: post.category,
          excerpt: post.excerpt,
          content: post.content,
          layout: post.layout,
          imageLabel: post.imageLabel,
          image: post.image ?? null,
        })
        .where(eq(schema.blogPosts.id, row.id));
    }
  }

  // The photo essay files itself under a category ("Bottega") that no row used
  // before, and the storefront's filter rail is built from the `categories`
  // table — so without this the new post's tag would join to nothing.
  if (apply) await reconcileCategories(db);

  console.log(
    created + updated === 0
      ? "Nothing to do — the diary already matches lib/data.ts."
      : `${created} created, ${updated} updated, ${skipped} left alone${apply ? "" : " (nothing written)"}.`,
  );
  db.$client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
