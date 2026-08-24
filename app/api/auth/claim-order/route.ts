import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { registerFromOrder } from "@/lib/auth/service";
import { attachOrderToUser } from "@/lib/auth/claim";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

/**
 * Turn a just-completed guest order into an account — or bind it to the one the
 * visitor is already signed into.
 *
 * **Entitlement is the order's unguessable id**, carried in the confirmation
 * URL. That is what proves the caller is the person who completed this
 * checkout. It is explicitly NOT taken as proof of the email address: someone
 * could have typed a stranger's address at checkout, so the account created here
 * starts unverified and reaches no *other* order until the verification link is
 * clicked (see `claimGuestOrders`).
 */
const bodySchema = z.object({
  orderId: z.string().trim().min(1).max(60),
  password: z.string().min(8).max(200).optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origine non consentita" }, { status: 403 });
  }

  const limited = rateLimit(`claim-order:${clientIp(request)}`, { limit: 10, windowMs: 60_000 });
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

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, parsed.data.orderId))
    .limit(1);
  // A wrong id is indistinguishable from a missing order — the id IS the
  // credential, so there is nothing to tell apart.
  if (!order) {
    return NextResponse.json({ ok: false, error: "Ordine non trovato." }, { status: 404 });
  }
  if (order.userId) {
    return NextResponse.json(
      { ok: false, error: "Questo ordine è già collegato a un account." },
      { status: 409 },
    );
  }

  // Already signed in: just bind it. No password needed, and no new account.
  const viewer = await getCurrentUser();
  if (viewer) {
    const res = await attachOrderToUser(order.id, viewer.id);
    if (!res.attached) {
      return NextResponse.json(
        { ok: false, error: "Questo ordine è già collegato a un account." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, mode: "attached", points: res.points });
  }

  if (!parsed.data.password) {
    return NextResponse.json({ ok: false, error: "Scegli una password." }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, order.email.trim().toLowerCase()))
    .limit(1);
  if (existing) {
    // Deliberately does NOT attach: holding this order's token proves the caller
    // placed the order, not that they own the account already registered on the
    // address. They can sign in and bind it from this same page.
    return NextResponse.json(
      {
        ok: false,
        error: "Esiste già un account con questa email. Accedi e potrai collegare l'ordine.",
        existingAccount: true,
      },
      { status: 409 },
    );
  }

  const result = await registerFromOrder({
    orderId: order.id,
    name: order.name,
    email: order.email,
    phone: order.phone,
    password: parsed.data.password,
  });
  if (!result.ok) return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ ok: true, mode: "registered", points: result.points });
}
