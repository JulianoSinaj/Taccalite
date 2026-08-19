import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getAccountByCard } from "@/lib/loyalty";

export const runtime = "nodejs";

/**
 * Resolve a loyalty card to its holder, for the in-shop confirmation step.
 *
 * Read-only and exact-match: it takes a full card number and returns one holder
 * or nothing, so it can't be used to walk the customer base. Staff-accessible,
 * because staff are the ones standing at the till — and knowing whose card they
 * just scanned is the whole point of the screen.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
  }

  const card = (new URL(request.url).searchParams.get("card") ?? "").trim();
  if (!card) return NextResponse.json({ ok: false, error: "Numero tessera mancante." });

  const account = await getAccountByCard(card);
  if (!account) return NextResponse.json({ ok: false, error: "Tessera non trovata." });
  if (!account.active) {
    return NextResponse.json({ ok: false, error: "Tessera di un account disattivato." });
  }

  return NextResponse.json({
    ok: true,
    name: account.name || account.username,
    points: account.points,
    cardNumber: account.cardNumber,
  });
}
