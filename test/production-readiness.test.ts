import { describe, it, expect, beforeAll, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products, settings, orderItems } from "@/lib/db/schema";
import { createOrder } from "@/lib/orders";

/**
 * Regressions for the 2026-08-25 production-readiness audit
 * (`docs/production-readiness-2026-08-25.md`).
 *
 * Every one of these shipped green through `tsc`, `eslint`, 456 passing tests
 * and `next build` — they are exactly the class of defect the existing suite
 * cannot see, so they get assertions of their own.
 */

const SHOP = "prod-ready-shop";

async function setSetting(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("§2 a partial basket is refused, not silently trimmed", () => {
  beforeAll(async () => {
    await setSetting("store.enabled", true);
    await db
      .insert(shops)
      .values({ slug: SHOP, name: "Prod Ready", specialty: "test", address: "via Test 1", storeEnabled: true })
      .onConflictDoNothing();
    await db
      .insert(products)
      .values([
        { slug: "pr-available", name: "Disponibile", priceCents: 1000, purchasable: true, active: true, shopSlug: SHOP },
        { slug: "pr-retired", name: "Ritirato", priceCents: 5000, purchasable: true, active: false, shopSlug: SHOP },
        { slug: "pr-not-sold", name: "Non vendibile", priceCents: 2000, purchasable: false, active: true, shopSlug: SHOP },
      ])
      .onConflictDoNothing();
  });

  const order = (slugs: string[]) =>
    createOrder({
      email: "cliente@example.it",
      name: "Cliente",
      fulfilment: "pickup",
      shopSlug: SHOP,
      paymentMethod: "in_store",
      items: slugs.map((slug) => ({ slug, quantity: 1 })),
    } as never);

  it("refuses when one line has been deactivated since the cart was filled", async () => {
    // Previously: created a 1-line, €10 order out of a €60 basket and said nothing.
    await expect(order(["pr-available", "pr-retired"])).rejects.toThrow(
      /un prodotto .* non è più disponibile/i,
    );
  });

  it("refuses when a line was made non-purchasable", async () => {
    await expect(order(["pr-available", "pr-not-sold"])).rejects.toThrow(/non è più disponibile/i);
  });

  it("counts the missing lines in the message", async () => {
    await expect(order(["pr-available", "pr-retired", "pr-not-sold"])).rejects.toThrow(
      /2 prodotti .* non sono più disponibili/i,
    );
  });

  it("still refuses a basket with nothing valid in it", async () => {
    await expect(order(["pr-retired"])).rejects.toThrow(/nessun prodotto valido/i);
  });

  it("writes every requested line when they all resolve", async () => {
    const created = await order(["pr-available"]);
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, created.orderId));
    expect(lines).toHaveLength(1);
    expect(created.totalCents).toBe(1000);
  });
});

describe("§1 SMTP is only reported as working when it can authenticate", () => {
  it("smtpAuthConfigured requires host AND both credentials", async () => {
    // Read as source: `lib/env` snapshots process.env at import time, and the
    // suite has already imported it. The rule is what must not regress.
    const src = read("lib/env.ts");
    const decl = /export const smtpAuthConfigured =([\s\S]*?);/.exec(src)?.[1] ?? "";
    expect(decl).toContain("env.smtp.host");
    expect(decl).toContain("env.smtp.user");
    expect(decl).toContain("env.smtp.pass");
  });

  it("the admin banner is gated on credentials, not merely on a host", () => {
    // The bug: `.env.example` pre-filled SMTP_HOST, so `smtpConfigured` was true
    // and the banner vanished on the one configuration that loses every message.
    const layout = read("app/admin/(dash)/layout.tsx");
    expect(layout).toContain("{!smtpAuthConfigured && (");
    expect(layout).not.toContain("{!smtpConfigured && (");
  });

  it("checkMailer reports authentication separately from connectivity", () => {
    const mailer = read("lib/mail/mailer.ts");
    // `verify()` resolves without ever issuing AUTH when no credentials are set,
    // so `ok` alone must never be rendered as "connesso e autenticato".
    expect(mailer).toContain("authenticated: smtpAuthConfigured");
    const settingsPage = read("app/admin/(dash)/settings/page.tsx");
    expect(settingsPage).toContain("mailer.authenticated");
  });

  it(".env.example does not ship a host with blank credentials", () => {
    const example = read(".env.example");
    const host = /^SMTP_HOST=(.*)$/m.exec(example)?.[1] ?? "";
    const user = /^SMTP_USER=(.*)$/m.exec(example)?.[1] ?? "";
    // Either both are filled in, or the host is empty and mail goes to the outbox.
    expect(host === "" || user !== "").toBe(true);
  });

  it("a relay that greets but is never authenticated is NOT reported as ok", async () => {
    // This is the whole bug, reproduced: a minimal relay that answers the
    // greeting and EHLO — which is all `verify()` exercises when the transport
    // carries no credentials. Against Brevo this resolved, and the settings page
    // printed "connesso e autenticato" while every message came back
    // `502 5.7.0 Please authenticate first`.
    const { createServer } = await import("node:net");
    const server = createServer((socket) => {
      socket.write("220 fake ESMTP\r\n");
      socket.on("data", (chunk) => {
        const line = chunk.toString();
        if (/^EHLO/i.test(line)) {
          socket.write("250-fake\r\n250 SMTPUTF8\r\n");
        } else if (/^QUIT/i.test(line)) {
          socket.write("221 Bye\r\n");
          socket.end();
        } else {
          socket.write("250 OK\r\n");
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    try {
      vi.resetModules();
      vi.stubEnv("SMTP_HOST", "127.0.0.1");
      vi.stubEnv("SMTP_PORT", String(port));
      vi.stubEnv("SMTP_USER", "");
      vi.stubEnv("SMTP_PASS", "");

      const { checkMailer } = await import("@/lib/mail/mailer");
      const result = await checkMailer();

      // It really does connect — that part was never in doubt.
      expect(result.configured).toBe(true);
      expect(result.ok).toBe(true);
      // …but nothing authenticated, and the UI must not claim otherwise.
      expect(result.authenticated).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("§3/§4 headers and robots travel with the app, not the proxy", () => {
  it("next.config.ts defines the security headers itself", () => {
    const config = read("next.config.ts");
    for (const header of [
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Strict-Transport-Security",
    ]) {
      expect(config, `${header} must not depend on the Caddyfile`).toContain(header);
    }
    expect(config).toContain("poweredByHeader: false");
    expect(config).toMatch(/async headers\(\)/);
  });

  it("the CSP allows every remote image host the config allows", () => {
    const config = read("next.config.ts");
    // A host in remotePatterns but not in img-src renders a blank box with only
    // a console error to explain it.
    for (const host of ["cdninstagram.com", "fbcdn.net", "public.blob.vercel-storage.com"]) {
      const inCsp = new RegExp(`IMAGE_HOSTS[\\s\\S]*?${host.replace(/\./g, "\\.")}`).test(config);
      expect(inCsp, `${host} missing from IMAGE_HOSTS`).toBe(true);
    }
  });

  it("never ships 'unsafe-eval' to production", () => {
    const config = read("next.config.ts");
    expect(config).toMatch(/isProd\s*\?\s*"script-src 'self' 'unsafe-inline'"/);
  });

  it("robots.txt resolves per request like sitemap.xml", () => {
    // Prerendered, it freezes NEXT_PUBLIC_SITE_URL at build time — and the Docker
    // build has none, because .dockerignore excludes .env.
    expect(read("app/robots.ts")).toContain('export const dynamic = "force-dynamic"');
    expect(read("app/sitemap.ts")).toContain('export const dynamic = "force-dynamic"');
  });
});

describe("§5 a misconfigured proxy cannot fail silently", () => {
  it("env warns when TRUST_PROXY is off", () => {
    // Off behind a proxy means clientIp() is a constant: one rate-limit bucket
    // for the whole internet, and the 11th checkout of the minute gets a 429.
    const src = read("lib/env.ts");
    expect(src).toContain("TRUST_PROXY is off");
  });

  it("clientIp still refuses to trust spoofable headers by default", async () => {
    const { clientIp } = await import("@/lib/rate-limit");
    const req = new Request("http://local", { headers: { "x-forwarded-for": "203.0.113.9" } });
    // The default must stay conservative — the warning is the fix, not trusting it.
    expect(clientIp(req)).toBe("untrusted-proxy");
  });
});

/**
 * Re-run of the same audit against a full production build and a seeded
 * database, 2026-08-25. All 76 routes answered 200, 472 unit tests and 12 e2e
 * specs were green — and the screen an operator checks to decide whether mail
 * works still printed a green "Configurato" while every message in the outbox
 * was failing `502 Please authenticate first`. The §1 fix reached the layout
 * banner and the settings page but not the two summaries below.
 */
describe("§1 (re-run) the dashboard and outbox summaries tell the same truth as the banner", () => {
  const dashboard = () => read("app/admin/(dash)/page.tsx");

  it("the dashboard integrations card gates mail on credentials, not merely on a host", () => {
    const src = dashboard();
    expect(src).toContain("smtpAuthConfigured");
    // The bug was a two-state read of the host-only flag, which renders green on
    // exactly the configuration that loses every message.
    expect(src).not.toMatch(/smtpConfigured\s*\?\s*"Configurato"/);
  });

  it("the dashboard distinguishes a missing host from blank credentials", () => {
    // Blank credentials is the louder failure: messages are marked `failed` and
    // retired, where a missing host merely leaves them queued.
    const src = dashboard();
    expect(src).toContain("Credenziali mancanti");
    expect(src).toContain("Modalità outbox (test)");
  });

  it("the dashboard does not claim simulated payments outside development", () => {
    // `simulatedPayments` is gated on NODE_ENV=development. Without keys in
    // production nothing is simulated — card checkout is withdrawn entirely, so
    // labelling that state "Modalità simulazione" described a mode that was not
    // running, on the same card that decides whether the shop can take money.
    const src = dashboard();
    expect(src).toContain("simulatedPayments");
    expect(src).not.toMatch(/stripeConfigured\s*\?\s*"Configurato"\s*:\s*"Modalità simulazione"/);
    expect(src).toContain("carta non disponibile");
  });

  it("the outbox banner is not silent when the relay is rejecting every message", () => {
    // `!smtpConfigured` is false with a host set, so the one screen whose job is
    // explaining why nothing arrived said nothing at all.
    const src = read("app/admin/(dash)/outbox/page.tsx");
    expect(src).toContain("smtpAuthConfigured");
    expect(src).not.toContain("{!smtpConfigured && (");
  });

  it("integration tones are whole class names Tailwind can find", () => {
    // An interpolated tone is not emitted by the JIT: the status would render
    // unstyled, which on a status card means a failure that looks like body
    // text. Comments are stripped first — the note explaining this rule beside
    // the constants would otherwise trip the rule.
    const code = dashboard().replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/text-\$\{/);
    expect(code).toContain("font-semibold text-ok");
    expect(code).toContain("font-semibold text-warn");
    expect(code).toContain("font-semibold text-danger");
  });
});

describe("§6 (re-run) no breadcrumb points at a route that does not exist", () => {
  it("every linkable segment label has a page behind it", () => {
    // `/admin/reports` has no page.tsx, but `reports` was in LABELS — so all
    // three report pages rendered a crumb that 404s, and Next prefetched that
    // 404 on every visit. LABELS answers "what is this called", which is not the
    // same question as "can I open it"; NOT_BROWSABLE answers the second.
    const src = read("components/admin/Breadcrumbs.tsx");

    const labels = [...(/const LABELS[\s\S]*?\n};/.exec(src)?.[0] ?? "").matchAll(/^\s*"?([a-z-]+)"?:/gm)].map(
      (m) => m[1],
    );
    expect(labels.length).toBeGreaterThan(10); // the regex still matches the map

    const notBrowsable = new Set(
      [...(/const NOT_BROWSABLE = new Set\(\[([\s\S]*?)\]\)/.exec(src)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
        (m) => m[1],
      ),
    );

    // readdirSync returns platform separators, so normalise before splitting.
    const pages = (readdirSync(resolve(__dirname, "..", "app/admin"), { recursive: true }) as string[]).map((p) =>
      p.split(sep).join("/"),
    );
    // Only the *innermost* directory of each page.tsx is browsable. Collecting
    // every ancestor instead would have counted `reports` as a route merely
    // because `reports/iva/page.tsx` exists — which is the bug, not the fix.
    const segments = new Set(
      pages
        .filter((p) => p.endsWith("page.tsx"))
        .map((p) => p.split("/").slice(0, -1).filter((s) => !s.startsWith("("))
          .at(-1))
        .filter((s): s is string => Boolean(s)),
    );
    segments.add("admin"); // app/admin/(dash)/page.tsx is /admin itself

    for (const label of labels) {
      if (notBrowsable.has(label)) continue;
      expect(segments.has(label), `breadcrumb links /…/${label} but no page.tsx sits there`).toBe(true);
    }
  });

  it("a segment marked not-browsable is genuinely not a route", () => {
    const src = read("components/admin/Breadcrumbs.tsx");
    expect(src).toContain("NOT_BROWSABLE");
    expect(existsSync(resolve(__dirname, "..", "app/admin/(dash)/reports/page.tsx"))).toBe(false);
  });
});

describe("§7 the remaining launch items", () => {
  it("the CLI bootstrap loads .env, so scripts and the dev server agree", () => {
    // Next loads `.env` automatically; plain `tsx` does not, and nothing here
    // ever called dotenv. `admin:reset` therefore wrote the DEV_DEFAULTS
    // password whatever ADMIN_PASSWORD said, and a `.env`-only DATABASE_URL was
    // ignored — the seed went into the local file instead of the real database.
    const src = read("scripts/_bootstrap-env.ts");
    expect(src).toContain("loadEnvFile");
    // Must not clobber the real environment: Vercel and Docker pass values as
    // actual env vars, and those have to win. `loadEnvFile` leaves them alone —
    // asserting the call is guarded, not that we re-implemented precedence.
    expect(src).toMatch(/typeof process\.loadEnvFile === "function"/);
  });

  it("SESSION_SECRET is gone rather than documented as load-bearing", () => {
    // It signed nothing — sessions are opaque random DB tokens — yet .env.example
    // said "MUST be set in production" and DEPLOYMENT.md said rotating it logged
    // everyone out. An operator following that had no working revocation lever.
    expect(read("lib/env.ts")).not.toContain("sessionSecret");
    // The *variable* must be gone; the note explaining why it went is not a
    // regression, it is what stops someone reinstating it. So: no assignment in
    // `.env.example`, no key in the CI env block, nothing in DEPLOYMENT.md.
    expect(read(".env.example")).not.toMatch(/^\s*SESSION_SECRET=/m);
    expect(read(".github/workflows/ci.yml")).not.toMatch(/^\s*SESSION_SECRET:/m);
    expect(read("DEPLOYMENT.md")).not.toContain("SESSION_SECRET");
    // The real lever must be named where the false one used to be.
    expect(read("DEPLOYMENT.md")).toContain("Chiudi le altre sessioni");
  });

  it("the health endpoint can report mail failure, and does not leak it publicly", () => {
    const src = read("app/api/health/route.ts");
    // A broken relay takes nothing down: every route answers 200 while the
    // outbox fills up. This is that state in a form a monitor can watch.
    expect(src).toContain("smtpAuthConfigured");
    expect(src).toContain("failed24h");
    // 503 on degraded, so a plain uptime check alerts without parsing JSON.
    expect(src).toContain("degraded ? 503 : 200");
    // …but the detail is operational, and this route is public: it must be
    // behind the same bearer the scheduler uses, and the bare probe unchanged.
    expect(src).toContain("secretMatches");
    expect(src).toMatch(/if \(!full\) return NextResponse\.json\(\{ status: "ok" \}/);
  });

  it("every public form that collects personal data links the privacy policy", () => {
    // GDPR art. 13 wants the notice at the point of collection. The only link
    // was in the footer, which is not where someone typing their phone number
    // is looking.
    for (const form of [
      "components/NewsletterForm.tsx",
      "components/ReservationForm.tsx",
      "components/site/ContactForm.tsx",
      "components/store/BackInStockForm.tsx",
      "components/store/CheckoutClient.tsx",
      "components/account/AuthForms.tsx",
    ]) {
      expect(read(form), `${form} collects personal data with no privacy notice`).toContain(
        "PrivacyNote",
      );
    }
    expect(read("components/site/PrivacyNote.tsx")).toContain('href="/privacy"');
  });

  it("the checkout links the terms of sale, and the page exists and is reachable", () => {
    // Ordering online formed a contract with no published terms and no statement
    // of the right of withdrawal — which for a shop selling mostly perishable
    // goods is backwards: the art. 59 exceptions only protect you if disclosed.
    expect(read("components/store/CheckoutClient.tsx")).toMatch(/<PrivacyNote[^>]*\sterms/);
    expect(existsSync(resolve(__dirname, "..", "app/(site)/termini/page.tsx"))).toBe(true);
    expect(read("components/site/SiteFooter.tsx")).toContain('href="/termini"');
    expect(read("app/sitemap.ts")).toContain('absoluteUrl("/termini")');
  });

  it("the terms name the withdrawal exceptions the catalogue actually relies on", () => {
    const src = read("lib/site-content.ts");
    // `\r?\n`: this file is CRLF, so a bare `\n` in the terminator never matches
    // and the body reads back as "" — a green test asserting nothing.
    const body =
      /key: "legal\.terms\.body"[\s\S]*?default: `([\s\S]*?)`,\r?\n {2}\},/.exec(src)?.[1] ?? "";
    expect(body.length).toBeGreaterThan(500);
    expect(body).toContain("art. 52"); // the 14-day right
    expect(body).toContain("art. 59"); // and why most of this catalogue is exempt
    expect(body).toContain("deteriorarsi");
    // Drafted, not lawyered: the clauses needing the owner's own facts are
    // flagged, and the flag must survive edits to the surrounding prose.
    expect(body).toContain("DA VERIFICARE");
  });

  it("README does not present `next start` as the deployment command", () => {
    // `output: "standalone"` is on, and next start warns that it does not work.
    const readme = read("README.md");
    const row = /\|\s*`npm run start`\s*\|([^|]*)\|/.exec(readme)?.[1] ?? "";
    expect(row).toMatch(/standalone/i);
  });
});

/**
 * A production install running on the published development secrets should be
 * visible to a monitor, not only to whoever read the boot log once.
 * `ADMIN_PASSWORD=taccalite-admin` is in `.env.example` in this repository and
 * the login page is public.
 */
describe("insecureDefaults", () => {
  it("is empty in development, where the defaults are the point", async () => {
    // The suite runs with NODE_ENV=development (vitest.config.ts).
    const { insecureDefaults } = await import("@/lib/env");
    expect(insecureDefaults).toEqual([]);
  });

  it("names the variable rather than its value", async () => {
    const { insecureDefaults } = await import("@/lib/env");
    for (const name of insecureDefaults) {
      expect(name).toMatch(/^[A-Z_]+$/);
    }
  });
});
