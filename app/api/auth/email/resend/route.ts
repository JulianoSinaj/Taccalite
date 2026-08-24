import { NextResponse } from "next/server";
import { emailResendSchema } from "@/lib/validation/auth";
import { resendVerification, sendVerificationEmail } from "@/lib/auth/service";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimitDurable, clientIp } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

const GENERIC = "Se l'indirizzo è in attesa di conferma, ti abbiamo inviato un nuovo link.";

/**
 * Re-send a verification link.
 *
 * Two callers, one endpoint. A signed-in customer sends no body and gets a link
 * for their own address — no oracle to worry about, they already know whether
 * their own account exists. Anyone else supplies an address and gets the fixed
 * response regardless of what is behind it.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origine non consentita" }, { status: 403 });
  }

  const limited = await rateLimitDurable(`email-resend:${clientIp(request)}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Troppe richieste. Riprova tra qualche minuto." },
      { status: 429 },
    );
  }

  const user = await getCurrentUser();
  if (user) {
    if (!user.email) {
      return NextResponse.json(
        { ok: false, error: "Aggiungi prima un indirizzo email al tuo account." },
        { status: 400 },
      );
    }
    await sendVerificationEmail(user, user.email);
    return NextResponse.json({ ok: true, message: "Ti abbiamo inviato un nuovo link." });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }

  const parsed = emailResendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true, message: GENERIC });

  const perAddress = await rateLimitDurable(`email-resend-addr:${parsed.data.email}`, {
    limit: 3,
    windowMs: 15 * 60_000,
  });
  if (perAddress.ok) await resendVerification(parsed.data.email);

  return NextResponse.json({ ok: true, message: GENERIC });
}
