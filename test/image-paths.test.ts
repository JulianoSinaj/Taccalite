import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Every `/images/…` path the source names has to exist in `public/`.
 *
 * This exists because of a bug that shipped and nobody noticed for a day. On
 * 2026-09-02 the `porchetta.gallery` defaults in `lib/site-content.ts` started
 * naming `/images/porchetta-legatura-spago.jpg` and
 * `/images/porchetta-arrosto-croccante.jpg`; the two JPEGs themselves were not
 * committed until 2026-09-03, twenty-one hours later. Everything built in
 * between served the galleria with two `<img>` pointing at 404s — two of the
 * four tiles rendered as the browser's broken-image glyph with the Italian alt
 * text sitting next to it, on a public page, live.
 *
 * Nothing caught it, and nothing *could* have: a missing image is not a type
 * error, not a lint error, and not a build error. `next build` is perfectly
 * happy to emit a `<img src>` for a file that is not there, and the two tiles
 * either side of the hole kept working, so the page looked plausible in a
 * glance at a deploy preview. The only honest signal is the one this test
 * makes: compare what the source *asks for* against what `public/` *has*.
 *
 * It sweeps the whole of the shipped source rather than just the CMS defaults,
 * because the same gap is available to a hardcoded `<Image src="…">` in a
 * component, to a seeded blog body in `lib/data.ts`, and to `PhotoCredit`'s
 * `src`-keyed map — all of which name files as plain strings.
 *
 * If this fails: add the file to `public/images/`, or fix the path. Do not add
 * the path to `PLACEHOLDERS` — that list is for syntax examples, and is checked
 * from the other side (see below) precisely so it cannot be used as a mute
 * button for a real missing image.
 */

const ROOT = resolve(__dirname, "..");

/** Where the shipped source lives. `test/` and `e2e/` are deliberately out. */
const SOURCE_ROOTS = ["app", "components", "lib", "scripts"];

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

/**
 * The image formats `public/images` actually holds. Kept explicit rather than
 * `\w+`, so a `/images/…` fragment that is really a directory (`fallback.ts`
 * builds `/images/instagram` and appends a shortcode at runtime) does not get
 * mistaken for a file this test can check.
 */
const IMAGE_PATH = /\/images\/[A-Za-z0-9._/-]+\.(?:jpe?g|png|webp|avif|svg|gif)/g;

/**
 * Filenames that are documentation of the markdown syntax, not references.
 *
 * `lib/blog-article.ts` and `lib/db/schema.ts` show authors how to write
 * `![didascalia](/images/x.jpg)` in a doc comment, and `components/admin/
 * forms.tsx` shows the shop the same thing in the editor's own help text. They
 * are the only two names in the codebase that are meant to point at nothing.
 *
 * Reuse one of these if you need a third example. Inventing a new placeholder
 * name will fail this test, which is the intended outcome: an unfamiliar
 * `/images/whatever.jpg` in the source should be assumed to be a real
 * reference until someone says otherwise.
 */
const PLACEHOLDERS = ["/images/x.jpg", "/images/foto.jpg"];

/** Every `.ts`/`.tsx` file under `dir`, recursively. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) found.push(path);
  }

  return found;
}

/** Every image path the source names, each with where it was named. */
function referencedPaths(): { path: string; where: string }[] {
  const references: { path: string; where: string }[] = [];

  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(join(ROOT, root))) {
      const lines = readFileSync(file, "utf8").split("\n");

      lines.forEach((line, i) => {
        for (const [path] of line.matchAll(IMAGE_PATH)) {
          if (PLACEHOLDERS.includes(path)) continue;
          // Reported as `lib/site-content.ts:214`, so a failure is a click away
          // from the line that has to change.
          references.push({
            path,
            where: `${relative(ROOT, file).replaceAll("\\", "/")}:${i + 1}`,
          });
        }
      });
    }
  }

  return references;
}

describe("image paths", () => {
  it("finds image references to check", () => {
    // A regex that silently stops matching would make every assertion below
    // pass by finding nothing at all, which is the one way this test could rot
    // into decoration. The site has dozens of these; ten is a floor, not a count.
    expect(referencedPaths().length).toBeGreaterThan(10);
  });

  it("every image the source names exists in public/", () => {
    const missing = referencedPaths()
      .filter(({ path }) => !existsSync(join(ROOT, "public", path)))
      // One line per site, because the same missing file is usually named in
      // more than one place and you want to fix all of them at once.
      .map(({ path, where }) => `${where} → public${path}`);

    expect(
      missing,
      `these images are referenced but not in public/:\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });

  it("the placeholder names really are placeholders", () => {
    // Checked from the other side: the moment somebody adds a real
    // `public/images/foto.jpg`, the entry above stops being an exemption for a
    // syntax example and starts hiding a file this test should be watching.
    const real = PLACEHOLDERS.filter((path) => existsSync(join(ROOT, "public", path)));

    expect(
      real,
      `these exist in public/ and so must be dropped from PLACEHOLDERS: ${real.join(", ")}`
    ).toEqual([]);
  });
});
