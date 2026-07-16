import { NextResponse } from "next/server";
import { reservationSchema } from "@/lib/validation/reservation";
import { createReservation } from "@/lib/reservations";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Reservation intake: validates (Zod), rate-limits by IP, rejects honeypot bots,
 * persists the reservation, and sends owner + customer emails.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = rateLimit(`prenotazioni:${ip}`, { limit: 6, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Troppe richieste. Riprova tra poco." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }

  const parsed = reservationSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { ok: false, error: first?.message ?? "Dati non validi", field: first?.path?.[0] },
      { status: 400 },
    );
  }

  // Honeypot: silently accept but do nothing.
  if (parsed.data.company) {
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await createReservation(parsed.data);
    return NextResponse.json({ ok: true, reference: result.reference });
  } catch (err) {
    console.error("Reservation error:", err);
    return NextResponse.json(
      { ok: false, error: "Si è verificato un errore. Riprova o chiamaci." },
      { status: 500 },
    );
  }
}
