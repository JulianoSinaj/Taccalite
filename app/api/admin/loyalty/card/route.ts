import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getCounterView } from "@/lib/loyalty";

export const runtime = "nodejs";

/**
 * Resolve a loyalty card for the in-shop screen: the holder, their balance and
 * last credit, the rewards waiting to be handed over and the ones they could
 * claim today.
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

  const view = await getCounterView(card);
  if (!view) return NextResponse.json({ ok: false, error: "Tessera non trovata." });
  if (!view.active) {
    return NextResponse.json({ ok: false, error: "Tessera di un account disattivato." });
  }

  const { userId, name, points, cardNumber, lastAccrual, pending, rewards } = view;
  // A balance is live data: never let a proxy or the browser hand back a stale one.
  return NextResponse.json(
    { ok: true, userId, name, points, cardNumber, lastAccrual, pending, rewards },
    { headers: { "Cache-Control": "no-store" } },
  );
}
