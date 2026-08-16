import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { CRON_JOBS, runCronJob } from "@/lib/automation";
import { env } from "@/lib/env";
import { runInstagramTokenRefresh } from "@/lib/instagram";

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
 *
 * The job list lives in `lib/automation`. Every run stamps its outcome into
 * settings, so Impostazioni can show whether the scheduler is actually firing.
 * Jobs that must not repeat within a period (the owner digest) self-limit, so
 * the frequent `job=all` sweep stays safe.
 */
async function handle(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretMatches(token)) {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
  }

  const job = new URL(request.url).searchParams.get("job") ?? "all";
  const selected = job === "all" ? CRON_JOBS : CRON_JOBS.filter((j) => j.key === job);
  if (selected.length === 0) {
    return NextResponse.json({ ok: false, error: `Job sconosciuto: ${job}` }, { status: 400 });
  }

  const results: Record<string, unknown> = {};
  for (const j of selected) {
    results[j.key] = await runCronJob(j);
  }

  // Self-limits to one refresh per week (and no-ops when Instagram isn't configured).
  if (job === "instagram-refresh" || job === "all") {
    results.instagramRefresh = await runInstagramTokenRefresh();
  }

  return NextResponse.json({ ok: true, job, results });
}

export const GET = handle;
export const POST = handle;
