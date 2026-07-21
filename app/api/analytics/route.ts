import { NextResponse } from "next/server";
import { z } from "zod";
import { recordPageView } from "@/lib/analytics";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

const schema = z.object({
  path: z.string().min(1).max(512),
  referrer: z.string().max(2048).nullish(),
});

/** First-party analytics beacon. Fire-and-forget; always 2xx so the client never
 *  surfaces an error. Rate-limited, and admin/api paths are never recorded. */
export async function POST(request: Request) {
  // Only accept beacons fired from our own pages; ignore cross-origin silently.
  if (!isSameOrigin(request)) return NextResponse.json({ ok: true }, { status: 202 });

  const rl = rateLimit(`analytics:${clientIp(request)}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: true }, { status: 202 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { path } = parsed.data;
  if (path.startsWith("/admin") || path.startsWith("/api")) {
    return NextResponse.json({ ok: true });
  }

  await recordPageView(path, parsed.data.referrer ?? null);
  return NextResponse.json({ ok: true });
}
