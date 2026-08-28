import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * The dark theme is declared twice — once for an explicit `data-theme="dark"`,
 * once inside `@media (prefers-color-scheme: dark)` for "automatico". Stating
 * each value once with `light-dark()` doesn't survive the build: Lightning CSS
 * down-levels it into a toggle it only wires up for `:root`/`.light`/`.dark`, so
 * on an attribute selector every descendant silently resolves to the light
 * branch — a whole admin that stays cream while the shell goes dark.
 *
 * Duplication is therefore the correct answer, and this is the guard that makes
 * it safe: the drift these tests exist to catch is someone editing one copy.
 */

const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");

/** The declarations inside the first `{ … }` following `marker`. */
function blockAfter(marker: string): string {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`marker not found: ${marker}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated block: ${marker}`);
}

/** `--name: value` pairs, comments and indentation stripped. */
function tokens(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, name, value] of block
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(name, value.trim().replace(/\s+/g, " "));
  }
  return out;
}

const light = tokens(blockAfter(":root"));
const explicitDark = tokens(blockAfter('[data-theme="dark"]'));
const systemDark = tokens(blockAfter('[data-theme="system"]'));

describe("dark theme declarations", () => {
  it("declares the same tokens in both copies", () => {
    expect([...systemDark.keys()].sort()).toEqual([...explicitDark.keys()].sort());
  });

  it("gives them the same values in both copies", () => {
    for (const [name, value] of explicitDark) {
      expect(`${name}: ${systemDark.get(name)}`).toBe(`${name}: ${value}`);
    }
  });

  it("is not empty (the parser would otherwise pass vacuously)", () => {
    expect(explicitDark.size).toBeGreaterThan(30);
  });

  it("does not apply to print", () => {
    // The ramp is *inverted*, not merely re-tinted, so a dark theme that reaches
    // the printer puts near-white ink on white paper. The packing slip renders
    // inside the dashboard layout and inherits `data-theme`, so this is a real
    // page, not a hypothetical. Both blocks must stay behind `screen`.
    expect(css).toMatch(/@media screen\s*\{\s*\[data-theme="dark"\]/);
    expect(css).toMatch(/@media screen and \(prefers-color-scheme: dark\)/);
    // …and nothing may re-introduce an unguarded one.
    expect(css.match(/^\[data-theme="dark"\]/m)).toBeNull();
  });
});

describe("token coverage", () => {
  // Every themeable role the light theme defines must have a dark counterpart,
  // or that surface stays light while everything around it flips.
  const THEMED = [
    "--surface",
    "--surface-muted",
    "--surface-sunken",
    "--ok",
    "--ok-soft",
    "--ok-soft-fg",
    "--warn",
    "--warn-soft",
    "--warn-soft-fg",
    "--danger",
    "--danger-soft",
    "--danger-soft-fg",
    "--danger-solid",
    "--danger-solid-fg",
    "--info",
    "--info-soft",
    "--info-soft-fg",
    "--color-cream",
    "--color-brown-950",
    "--color-brown-900",
    "--color-brown-800",
    "--color-gold-deep",
  ];

  it.each(THEMED)("%s has both a light and a dark value", (name) => {
    expect(light.has(name)).toBe(true);
    expect(explicitDark.has(name)).toBe(true);
    expect(explicitDark.get(name)).not.toBe(light.get(name));
  });

  it("keeps --on-gold constant across themes", () => {
    // Gold is light in both themes, so the ink on top of it must NOT invert —
    // `text-brown-950` on a gold button would go light-on-light.
    expect(light.get("--on-gold")).toBe("#2a1a10");
    expect(explicitDark.has("--on-gold")).toBe(false);
  });
});

describe("the admin paints with tokens, not literals", () => {
  const root = resolve(__dirname, "..");

  /** Every `.tsx` under `dir`, as [repo-relative path, source]. */
  function sources(dir: string): [string, string][] {
    const out: [string, string][] = [];
    for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sources(p));
      else if (entry.name.endsWith(".tsx")) {
        out.push([relative(root, resolve(root, p)).replaceAll("\\", "/"), readFileSync(resolve(root, p), "utf8")]);
      }
    }
    return out;
  }

  /** The login page is its own dark composition and opts out by design. */
  const themed = [...sources("app/admin"), ...sources("components/admin")].filter(
    ([p]) => !p.includes("AdminLoginForm"),
  );

  /**
   * A single line may opt out with `theme-exempt`, either on the line itself or
   * anywhere in the comment block directly above it — so the reason can run to
   * more than one line, which it should.
   *
   * There is one honest case for a literal in the back office: a surface that
   * is not the back office. The newsletter composer previews the email in an
   * `<iframe>`, and that iframe's ground is the mail client's white, not the
   * gestionale's — inverting it in dark mode would show the operator a preview
   * of something no recipient will ever see. Exempting the whole file would
   * take the check off the composer's own chrome too, which is themed like
   * everything else, so the opt-out lives on the line and carries its reason.
   */
  const EXEMPT = /theme-exempt/;
  const COMMENT = /^\s*(\/\/|\/\*|\*)/;

  /** True when `i` carries the marker, or the comment block above it does. */
  const exempted = (lines: string[], i: number): boolean => {
    if (EXEMPT.test(lines[i])) return true;
    for (let j = i - 1; j >= 0 && COMMENT.test(lines[j]); j--) {
      if (EXEMPT.test(lines[j])) return true;
    }
    return false;
  };

  it("finds the admin sources", () => {
    expect(themed.length).toBeGreaterThan(20);
  });

  it.each([
    ["bg-white", /\bbg-white\b/],
    ["a literal status tint", /(?<![\w-])(bg|text|border)-(emerald|amber|rose|sky|orange)-\d{2,3}(?![\w-])/],
  ])("uses no %s", (_label, pattern) => {
    // Per line rather than per file, so a failure names the line to go and look
    // at instead of only the file it is somewhere inside.
    const offenders = themed.flatMap(([p, src]) => {
      const lines = src.split("\n");
      return lines
        .map((line, i) => [line, i] as const)
        .filter(([line, i]) => pattern.test(line) && !exempted(lines, i))
        .map(([, i]) => `${p}:${i + 1}`);
    });
    expect(offenders).toEqual([]);
  });
});
