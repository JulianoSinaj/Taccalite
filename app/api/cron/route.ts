import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runPorchettaReminders, runMaintenance } from "@/lib/automation";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/** Constant-time comparison that never short-circuits on length. */
function secretMatches(provided: string | null | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.cronSecret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Scheduled-jobs entry point. Protect with the CRON_SECRET, passed ONLY via the
 * `Authorization: Bearer <secret>` header (never the query string, which leaks
 * into proxy/access logs). Point a system cron / scheduler at:
 *   curl -s -H "Authorization: Bearer <CRON_SECRET>" "https://<host>/api/cron?job=all"
 */
async function handle(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretMatches(token)) {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
  }

  const url = new URL(request.url);
  const job = url.searchParams.get("job") ?? "all";
  const results: Record<string, unknown> = {};

  if (job === "porchetta-reminders" || job === "all") {
    results.porchettaReminders = await runPorchettaReminders();
  }
  if (job === "maintenance" || job === "all") {
    results.maintenance = await runMaintenance();
  }

  return NextResponse.json({ ok: true, job, results });
}

export const GET = handle;
export const POST = handle;
