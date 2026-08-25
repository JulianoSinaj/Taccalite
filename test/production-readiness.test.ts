import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
