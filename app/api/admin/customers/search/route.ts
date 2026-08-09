import { NextResponse } from "next/server";
import { desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, loyaltyAccounts, orders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";

export const runtime = "nodejs";

const LIMIT = 8;

/**
 * Customer lookup for back-office pickers (manual order, counter sale).
 *
 * Returns the few fields needed to prefill a form — contact details, loyalty
 * balance, and the address from the customer's most recent shipping order so a
 * repeat delivery doesn't have to be retyped. Staff-accessible: this is the same
 * data the customer list already shows them, one record at a time, and it is
 * never returned without a search term (so it can't be used to enumerate the
 * whole customer base in one call).
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return NextResponse.json({ ok: true, customers: [] });
  const term = `%${q}%`;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      phone: users.phone,
      points: loyaltyAccounts.points,
      cardNumber: loyaltyAccounts.cardNumber,
    })
    .from(users)
    .leftJoin(loyaltyAccounts, eq(loyaltyAccounts.userId, users.id))
    .where(
      // SQLite's LIKE already folds ASCII case, so no lower() wrapper is needed
      // (see the note in lib/admin/filters).
      or(
        like(sql`${users.name}`, term),
        like(sql`${users.username}`, term),
        like(sql`coalesce(${users.email}, '')`, term),
        like(sql`coalesce(${users.phone}, '')`, term),
        like(sql`coalesce(${loyaltyAccounts.cardNumber}, '')`, term),
      ),
    )
    .orderBy(desc(users.createdAt))
    .limit(LIMIT);

  // Last known shipping address per matched customer, so picking one can prefill
  // a delivery without retyping it.
  const customers = await Promise.all(
    rows.map(async (r) => {
      const [last] = await db
        .select({ shippingAddress: orders.shippingAddress })
        .from(orders)
        .where(eq(orders.userId, r.id))
        .orderBy(desc(orders.createdAt))
        .limit(1);
      return { ...r, lastAddress: last?.shippingAddress ?? null };
    }),
  );

  return NextResponse.json({ ok: true, customers });
}
