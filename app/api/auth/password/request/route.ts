import { NextResponse } from "next/server";
import { passwordResetRequestSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/lib/auth/service";
import { rateLimitDurable, clientIp } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

/**
 * "I forgot my password" — issues a reset link.
 *
 * Answers identically whether or not the address is registered. That is the
 * whole design constraint: a differing response (or status code, or latency
 * band) turns this endpoint into a membership oracle for the shop's customer
 * list. `requestPasswordReset` resolves to void for the same reason.
 *
 * Rate-limited twice: per IP, and per address. The second bucket is what stops
 * one mailbox being flooded from a botnet, which is both a nuisance to the
 * customer and a fast way to get the shop's sending domain blacklisted.
 */
const GENERIC = "Se l'indirizzo è registrato, ti abbiamo inviato un link per reimpostare la password.";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origine non consentita" }, { status: 403 });
  }

  const limited = await rateLimitDurable(`pwreset-ip:${clientIp(request)}`, { limit: 5, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Troppe richieste. Riprova tra poco." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }

  const parsed = passwordResetRequestSchema.safeParse(body);
  // A malformed address gets the same answer as a well-formed unknown one: the
  // client has already validated the shape, so anything reaching here that fails
  // is probing.
  if (!parsed.success) return NextResponse.json({ ok: true, message: GENERIC });

  const perAddress = await rateLimitDurable(`pwreset-addr:${parsed.data.email}`, {
    limit: 3,
    windowMs: 15 * 60_000,
  });
  if (perAddress.ok) {
    await requestPasswordReset(parsed.data.email);
  }

  return NextResponse.json({ ok: true, message: GENERIC });
}
