import { NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/auth/service";
import { absoluteUrl } from "@/lib/site";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Address-verification landing, followed straight from an email.
 *
 * A GET, and deliberately **not** Origin-checked: the click arrives from a mail
 * client with no same-origin header, exactly like the newsletter confirm link
 * (see the note in `lib/security/origin.ts`). The token is the credential.
 *
 * Redirects rather than rendering, so the one-shot token never sits in a page
 * the browser might re-request — and so the outcome lands on the account page
 * where the customer can immediately see the orders that were just claimed.
 */
export async function GET(request: Request) {
  const limited = rateLimit(`email-verify:${clientIp(request)}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) return NextResponse.redirect(absoluteUrl("/account?verifica=errore"));

  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(absoluteUrl("/account?verifica=errore"));

  const result = await verifyEmailToken(token);
  if (!result.ok) return NextResponse.redirect(absoluteUrl("/account?verifica=scaduto"));

  const { orders, points } = result.claimed;
  const params = new URLSearchParams({ verifica: "ok" });
  if (orders > 0) {
    params.set("ordini", String(orders));
    if (points > 0) params.set("punti", String(points));
  }
  return NextResponse.redirect(absoluteUrl(`/account?${params.toString()}`));
}
