import { NextResponse } from "next/server";
import { passwordResetSchema } from "@/lib/validation/auth";
import { resetPassword } from "@/lib/auth/service";
import { rateLimitDurable, clientIp } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

/** Redeem a reset link and set the new password. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origine non consentita" }, { status: 403 });
  }

  // Tighter than the request endpoint: this one takes a guessable-in-principle
  // secret, so it is the surface an attacker would grind against.
  const limited = await rateLimitDurable(`pwreset-redeem:${clientIp(request)}`, { limit: 10, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Troppi tentativi. Riprova tra poco." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }

  const parsed = passwordResetSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: first?.message ?? "Dati non validi" }, { status: 400 });
  }

  const result = await resetPassword(parsed.data);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ ok: true });
}
