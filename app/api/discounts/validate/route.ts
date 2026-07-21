import { NextResponse } from "next/server";
import { z } from "zod";
import { validateDiscount } from "@/lib/discounts";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().trim().min(1).max(40),
  subtotalCents: z.coerce.number().int().min(0).max(100_000_00),
});

/**
 * Preview a discount code for the storefront checkout. Returns the concrete
 * amount it takes off the given subtotal (or an error). The order endpoint
 * re-validates authoritatively, so this is a UX helper, not the source of truth.
 * Rate-limited to blunt code enumeration.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origine non consentita" }, { status: 403 });
  }
  const limited = rateLimit(`coupon:${clientIp(request)}`, { limit: 20, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Troppi tentativi. Riprova tra poco." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dati non validi" }, { status: 400 });
  }

  const discount = await validateDiscount(parsed.data.code, parsed.data.subtotalCents);
  if (!discount) {
    return NextResponse.json({ ok: false, error: "Codice non valido o non applicabile a questo ordine." });
  }
  return NextResponse.json({
    ok: true,
    code: discount.code,
    discountCents: discount.discountCents,
    freeShipping: discount.freeShipping,
  });
}
