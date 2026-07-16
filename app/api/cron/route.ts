import { NextResponse } from "next/server";
import { runPorchettaReminders } from "@/lib/automation";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Scheduled-jobs entry point. Protect with the CRON_SECRET (query `?secret=` or
 * `Authorization: Bearer <secret>`). Point a system cron / Hetzner scheduler at:
 *   curl -s "https://<host>/api/cron?job=porchetta-reminders&secret=<CRON_SECRET>"
 */
async function handle(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") ?? request.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== env.cronSecret) {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });
  }

  const job = url.searchParams.get("job") ?? "all";
  const results: Record<string, unknown> = {};

  if (job === "porchetta-reminders" || job === "all") {
    results.porchettaReminders = await runPorchettaReminders();
  }

  return NextResponse.json({ ok: true, job, results });
}

export const GET = handle;
export const POST = handle;
