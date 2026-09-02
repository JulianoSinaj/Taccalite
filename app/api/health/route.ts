import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailOutbox } from "@/lib/db/schema";
import { env, insecureDefaults, smtpAuthConfigured, smtpConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time comparison that never short-circuits on length. */
function secretMatches(provided: string | null | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.cronSecret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Liveness/readiness probe for the container healthcheck and reverse proxy.
 * Runs a trivial query so "healthy" means the process is up AND the SQLite
 * database is reachable. Returns 200 when OK, 503 otherwise. Intentionally
 * leaks no internal detail (no versions, paths, or error text).
 *
 * `?checks=full` additionally reports the things that fail *silently* — mail
 * above all. A broken relay takes nothing down: the site serves 200 on every
 * route while order confirmations and password resets die in the outbox, which
 * is how it survived four audits. The dashboard says so now, but only to
 * someone who opens it; this is the same signal in a form a monitor can watch.
 *
 * Deliberately NOT part of the plain probe:
 *  - it costs two extra queries, and the container healthcheck runs constantly;
 *  - "our mail is down" is operational detail, and this route is public. Hence
 *    the same `CRON_SECRET` bearer the scheduler uses. Point an uptime monitor
 *    at it with that header and alert on non-200 — no JSON parsing needed,
 *    since a degraded check answers 503.
 */
export async function GET(request: Request) {
  const full = new URL(request.url).searchParams.get("checks") === "full";

  try {
    await db.get(sql`select 1`);
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }

  if (!full) return NextResponse.json({ status: "ok" }, { status: 200 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretMatches(token)) {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
  }

  // A rolling window, not a lifetime total: a batch that failed months ago and
  // was dealt with must not pin the monitor red forever.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [failed] = await db
    .select({ n: sql<number>`count(*)` })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "failed"), gte(emailOutbox.createdAt, since)));

  const mail = {
    // Host set with blank credentials is its own state: the relay rejects every
    // message, where no host at all merely queues them. See lib/env.ts.
    configured: smtpConfigured,
    authenticated: smtpAuthConfigured,
    failed24h: Number(failed?.n ?? 0),
  };

  // Mail that cannot authenticate is degraded even with an empty outbox — the
  // failures only appear once someone tries to place an order.
  //
  // Secrets left at their published development defaults count too. That is
  // warned about once at boot, at the top of a log nobody reads twice, while
  // `ADMIN_PASSWORD=taccalite-admin` is in `.env.example` in the repository and
  // the login page is public. A monitor should see it.
  const degraded =
    (smtpConfigured && !smtpAuthConfigured) || mail.failed24h > 0 || insecureDefaults.length > 0;

  return NextResponse.json(
    {
      status: degraded ? "degraded" : "ok",
      database: "ok",
      mail,
      // Names only — the variables that are wrong, never their values.
      insecureDefaults,
    },
    { status: degraded ? 503 : 200 },
  );
}
