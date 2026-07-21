import { NextResponse } from "next/server";
import { z } from "zod";
import { getProductBySlug } from "@/lib/db/queries";
import { requestStockNotification } from "@/lib/stock-notify";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

const bodySchema = z.object({
  slug: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
});

/** Register a customer's email to be notified when a product is back in stock. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origine non consentita" }, { status: 403 });
  }
  const limited = rateLimit(`stocknotify:${clientIp(request)}`, { limit: 10, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Troppe richieste. Riprova tra poco." }, { status: 429 });
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

  const product = await getProductBySlug(parsed.data.slug);
  if (!product || !product.active) {
    return NextResponse.json({ ok: false, error: "Prodotto non trovato" }, { status: 404 });
  }

  await requestStockNotification(product.id, parsed.data.email);
  // Always report success (don't leak whether the email was already registered).
  return NextResponse.json({ ok: true });
}
