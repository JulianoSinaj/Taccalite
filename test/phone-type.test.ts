import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * The storefront's micro-caps floor, and the one thing that keeps it honest.
 *
 * `app/globals.css` raises the site's smallest label sizes on a phone by matching
 * the literal Tailwind utility — `.site-shell [class~="text-[0.625rem]"]` and its
 * neighbours — because those sizes are spelled out longhand at a hundred and
 * fifty call sites and a scale that lives at its call sites is not a scale.
 *
 * The cost of matching on the utility is that a size the block does not list
 * fails silently: the label simply renders at 10px on a phone and nothing says
 * so. This test is the alarm. It reads the same file the browser does, works out
 * which sizes the block lifts and what it lifts them to, then walks the
 * storefront source for any size that would render under the floor and is not
 * covered.
 *
 * If it fails you have two honest options: add the new size to the block in
 * `globals.css`, or use one the block already covers. Deleting the assertion
 * leaves a label that only the phone gets wrong.
 */

const ROOT = resolve(__dirname, "..");
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

/**
 * The smallest a storefront label may render on a phone, in rem against the
 * phone's own root. Below this an uppercase, letter-spaced label stops reading
 * as a word — which is the whole reason the block exists.
 */
const FLOOR_REM = 0.6875;

/** Tailwind's named sizes the storefront also uses, for the last assertion. */
const NAMED_REM: Record<string, number> = {
  "text-xs": 0.75,
  "text-sm": 0.875,
  "text-base": 1,
};

/** `0.625rem` / `11px` → rem. An author writing px means device pixels. */
function toRem(raw: string): number | null {
  const rem = raw.match(/^([\d.]+)rem$/);
  if (rem) return Number(rem[1]);
  const px = raw.match(/^([\d.]+)px$/);
  if (px) return Number(px[1]) / 16;
  return null;
}

/** The block, as `{ lifted: the sizes matched, to: what they become }` rules. */
function floorRules(): { lifted: string[]; to: number }[] {
  const start = css.indexOf("The micro-caps floor");
  expect(start, "the micro-caps floor block is gone from globals.css").toBeGreaterThan(-1);
  const end = css.indexOf("Body copy on a narrow column", start);
  const block = css.slice(start, end === -1 ? undefined : end);

  const rules: { lifted: string[]; to: number }[] = [];
  for (const [, selector, declaration] of block.matchAll(
    /((?:\s*\.site-shell\s*\[class~="text-\[[^\]]+\]"\],?)+)\s*\{([^}]*)\}/g
  )) {
    const lifted = [...selector.matchAll(/text-\[([^\]]+)\]/g)].map((m) => m[1]);
    const size = declaration.match(/font-size:\s*([\d.]+rem)/);
    if (!size) continue;
    rules.push({ lifted, to: toRem(size[1])! });
  }
  expect(rules.length, "no font-size rules found in the micro-caps floor block").toBeGreaterThan(0);
  return rules;
}

const STOREFRONT = ["app/(site)", "components/site", "components/store"];
/** Shared components the storefront renders that sit outside those roots. */
const ALSO = [
  "components/CookieConsent.tsx",
  "components/NewsletterForm.tsx",
  "components/ReservationForm.tsx",
  "components/InstagramFeed.tsx",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

function storefrontFiles(): string[] {
  const files: string[] = [];
  for (const dir of STOREFRONT) files.push(...walk(join(ROOT, dir)));
  for (const file of ALSO) files.push(join(ROOT, file));
  return files;
}

describe("the storefront's phone type floor", () => {
  const rules = floorRules();
  /** Every size the block lifts, and what it lifts it to. */
  const lifted = new Map(rules.flatMap((rule) => rule.lifted.map((size) => [size, rule.to])));

  it("covers every arbitrary text size that would render under the floor", () => {
    const missed: string[] = [];
    for (const file of storefrontFiles()) {
      const source = readFileSync(file, "utf8");
      // Unprefixed only: a `sm:text-[0.5625rem]` never applies on a phone, which
      // is exactly why the CSS matches whole class tokens with `~=`.
      for (const [, raw] of source.matchAll(/(?<![\w:-])text-\[([\d.]+(?:rem|px))\]/g)) {
        const rem = toRem(raw);
        if (rem == null || rem >= FLOOR_REM) continue;
        if (!lifted.has(raw)) missed.push(`${relative(ROOT, file)} — text-[${raw}]`);
      }
    }
    expect([...new Set(missed)], "sizes under the phone floor that globals.css does not lift").toEqual(
      []
    );
  });

  it("lifts each of them to the floor or above", () => {
    for (const [raw, to] of lifted) {
      expect(to, `text-[${raw}] is lifted to something still under the floor`).toBeGreaterThanOrEqual(
        FLOOR_REM
      );
    }
  });

  it("lifts nothing that was already big enough", () => {
    for (const [raw, to] of lifted) {
      const rem = toRem(raw);
      expect(rem, `text-[${raw}] is not a size this test can read`).not.toBeNull();
      // A size may be listed either because it is under the floor, or because it
      // sits *at* the floor and the block gives that tier its own step up — but
      // never because someone added a size that is already comfortable.
      expect(rem!, `text-[${raw}] is well above the floor and needs no rule`).toBeLessThanOrEqual(
        FLOOR_REM
      );
      if (rem! === FLOOR_REM) {
        expect(to, `text-[${raw}] is listed but lifted to nothing`).toBeGreaterThan(FLOOR_REM);
      }
    }
  });

  it("keeps the named Tailwind sizes above the floor, so they need no rule", () => {
    for (const [name, rem] of Object.entries(NAMED_REM)) {
      expect(rem, `${name} would need lifting too`).toBeGreaterThanOrEqual(FLOOR_REM);
    }
  });
});
