import { NextResponse } from "next/server";

/**
 * Stub endpoint: validates and logs the reservation request.
 * Wire this up to email/CRM/database once the owner picks a provider.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const required = ["name", "phone", "date", "time", "guests", "shop"];
  const missing = required.filter((key) => !body[key]);

  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Campi mancanti: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  console.log("Nuova richiesta di prenotazione:", body);

  return NextResponse.json({ ok: true });
}
