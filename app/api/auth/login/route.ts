import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation/auth";
import { loginUser } from "@/lib/auth/service";
import { rateLimitDurable, clientIp } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origine non consentita" }, { status: 403 });
  }

  const limited = await rateLimitDurable(`login:${clientIp(request)}`, { limit: 10, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Troppi tentativi. Riprova tra poco." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }

  // `username` is the pre-email-first field name. Accepted so a cached client
  // bundle (or a bookmarklet, or a script the shop wrote) keeps working through
  // the transition; `identifier` is what the current forms send and may hold
  // either an address or a legacy handle.
  const raw = (body ?? {}) as Record<string, unknown>;
  const parsed = loginSchema.safeParse({ ...raw, identifier: raw.identifier ?? raw.username });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dati non validi" }, { status: 400 });
  }

  const result = await loginUser(parsed.data);
  if (!result.ok) {
    // Signal the two-factor step to the client without treating it as a hard error.
    if (result.twoFactorRequired) {
      return NextResponse.json({ ok: false, twoFactorRequired: true, error: result.error }, { status: 401 });
    }
    return NextResponse.json(result, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
