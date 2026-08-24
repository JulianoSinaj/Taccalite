import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, users } from "@/lib/db/schema";
import { getSetting } from "@/lib/db/queries";
import { addPoints } from "@/lib/loyalty";
import { logAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail/mailer";
import { ordersClaimedEmail } from "@/lib/mail/templates";

/**
 * Attaching past guest orders to an account.
 *
 * `orders.userId` is set at checkout only when the buyer happened to be signed
 * in. Everyone else — the overwhelming majority, since the storefront never
 * required an account — left orders with an email and no owner. Registering
 * later did nothing: the order history was empty, the loyalty balance was zero,
 * and the programme had no funnel from the shop's actual sales.
 *
 * This closes that gap, but only on a **verified** address. Claiming on a typed
 * address alone would let anyone enter a known customer's email and inherit
 * their order history, which is a data breach with extra steps.
 */

/** How far back a claim reaches, in days. Zero or negative disables the lookback. */
const LOOKBACK_SETTING = "loyalty.claimLookbackDays";
const LOOKBACK_DEFAULT = 365;

async function claimCutoff(): Promise<Date | null> {
  const days = await getSetting<number>(LOOKBACK_SETTING, LOOKBACK_DEFAULT);
  if (!days || days <= 0) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Orders placed as a guest with this address that an account could still claim. */
export async function countClaimableOrders(email: string): Promise<number> {
  const address = email.trim().toLowerCase();
  if (!address) return 0;
  const cutoff = await claimCutoff();
  const conds = [
    eq(sql`lower(${orders.email})`, address),
    isNull(orders.userId),
    ...(cutoff ? [gt(orders.createdAt, cutoff)] : []),
  ];
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(and(...conds));
  return row?.n ?? 0;
}

export type ClaimResult = { orders: number; points: number };

/**
 * Attach every unowned order for `email` to `userId`, and back-credit loyalty
 * points for the ones that were actually paid.
 *
 * Idempotent by construction: the `userId` write is itself the guard, so an
 * order that has been claimed can never be claimed again — by this account or
 * any other. Re-running is a no-op, which matters because verification links
 * get clicked twice.
 *
 * Bounded on purpose. An address that has been in use for a decade could
 * otherwise mint a balance nobody budgeted for, so only orders inside the
 * lookback window count. Refunded orders are attached (the history is the
 * customer's) but earn nothing (the money went back).
 */
export async function claimGuestOrders(userId: string, email: string): Promise<ClaimResult> {
  const address = email.trim().toLowerCase();
  if (!address) return { orders: 0, points: 0 };

  const cutoff = await claimCutoff();
  const conds = [
    eq(sql`lower(${orders.email})`, address),
    isNull(orders.userId),
    ...(cutoff ? [gt(orders.createdAt, cutoff)] : []),
  ];

  // Claim first, read second. The UPDATE ... RETURNING is the atomic step: two
  // concurrent verifications of the same address (a double-clicked link) race
  // here, and exactly one of them comes away with the rows.
  const claimed = await db
    .update(orders)
    .set({ userId })
    .where(and(...conds))
    .returning({
      id: orders.id,
      orderNumber: orders.orderNumber,
      subtotalCents: orders.subtotalCents,
      paymentStatus: orders.paymentStatus,
    });

  if (claimed.length === 0) return { orders: 0, points: 0 };

  const loyaltyEnabled = await getSetting<boolean>("loyalty.enabled", true);
  let points = 0;
  if (loyaltyEnabled) {
    const perEuro = (await getSetting<number>("loyalty.pointsPerEuro", 1)) || 1;
    for (const o of claimed) {
      // Only settled-and-kept money earns. `refunded` orders stay attached to the
      // account — the customer did place them — but crediting points for goods
      // that were given back would pay twice for one sale.
      if (o.paymentStatus !== "paid") continue;
      const earned = Math.floor((o.subtotalCents / 100) * perEuro);
      if (earned <= 0) continue;
      await addPoints(userId, earned, `Ordine ${o.orderNumber} (recuperato)`);
      points += earned;
    }
  }

  const [user] = await db
    .select({ name: users.name, username: users.username, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await logAudit({
    actor: { id: userId, name: user?.name, username: user?.username },
    action: "account.orders_claimed",
    entity: "user",
    entityId: userId,
    summary: `${claimed.length} ordini collegati all'account dopo la verifica di ${address}${
      points > 0 ? ` (+${points} punti)` : ""
    }`,
    meta: { orders: claimed.map((o) => o.orderNumber), points },
  });

  if (user?.email) {
    await sendMail({
      to: user.email,
      ...ordersClaimedEmail(user.name || user.username || "", claimed.length, points),
    }).catch(() => {});
  }

  return { orders: claimed.length, points };
}

/**
 * Attach one specific order to an account, on the strength of the caller
 * holding that order's unguessable id.
 *
 * Separate from `claimGuestOrders`, and deliberately narrower. That function
 * runs on a *verified address* and sweeps up everything matching it. This one
 * runs on a *token* and touches exactly the order the token names — which is
 * the only thing the token proves. Whoever completed a checkout can bind that
 * order to an account; they cannot thereby reach any other order placed with
 * the same address, because typing someone else's email at checkout must not
 * be a way into their history.
 */
export async function attachOrderToUser(
  orderId: string,
  userId: string,
): Promise<{ attached: boolean; points: number }> {
  const [claimed] = await db
    .update(orders)
    .set({ userId })
    .where(and(eq(orders.id, orderId), isNull(orders.userId)))
    .returning({
      orderNumber: orders.orderNumber,
      subtotalCents: orders.subtotalCents,
      paymentStatus: orders.paymentStatus,
    });
  if (!claimed) return { attached: false, points: 0 };

  let points = 0;
  const loyaltyEnabled = await getSetting<boolean>("loyalty.enabled", true);
  if (loyaltyEnabled && claimed.paymentStatus === "paid") {
    const perEuro = (await getSetting<number>("loyalty.pointsPerEuro", 1)) || 1;
    points = Math.floor((claimed.subtotalCents / 100) * perEuro);
    if (points > 0) await addPoints(userId, points, `Ordine ${claimed.orderNumber} (collegato)`);
  }

  await logAudit({
    actor: { id: userId },
    action: "account.order_attached",
    entity: "order",
    entityId: orderId,
    summary: `Ordine ${claimed.orderNumber} collegato a un account dalla pagina di conferma${
      points > 0 ? ` (+${points} punti)` : ""
    }`,
    meta: { points },
  });

  return { attached: true, points };
}
