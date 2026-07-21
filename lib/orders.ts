import "server-only";
import { customAlphabet } from "nanoid";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems, products } from "@/lib/db/schema";
import { getShopBySlug, getSetting } from "@/lib/db/queries";
import { sendMail } from "@/lib/mail/mailer";
import { orderCustomerEmail, orderOwnerEmail, type OrderEmailData } from "@/lib/mail/templates";
import { addPoints } from "@/lib/loyalty";
import { env } from "@/lib/env";
import type { CheckoutInput } from "@/lib/validation/order";

const SHIPPING_CENTS = 700; // flat shipping fee
const orderCode = customAlphabet("0123456789", 4);

export function generateOrderNumber(): string {
  return `ORD-${new Date().getFullYear()}-${orderCode()}`;
}

export type CreatedOrder = {
  orderId: string;
  orderNumber: string;
  totalCents: number;
  items: { name: string; quantity: number; lineTotalCents: number }[];
};

/**
 * Server-authoritative order creation: prices come from the DB, never the client.
 */
export async function createOrder(input: CheckoutInput, userId?: string): Promise<CreatedOrder> {
  const slugs = input.items.map((i) => i.slug);
  const dbProducts = await db
    .select()
    .from(products)
    .where(and(eq(products.purchasable, true), eq(products.active, true), inArray(products.slug, slugs)));

  const priceMap = new Map(dbProducts.map((p) => [p.slug, p]));
  const lines = input.items
    .map((i) => {
      const p = priceMap.get(i.slug);
      if (!p || p.priceCents == null) return null;
      return {
        product: p,
        quantity: i.quantity,
        unitPriceCents: p.priceCents,
        lineTotalCents: p.priceCents * i.quantity,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (lines.length === 0) throw new Error("Nessun prodotto valido nel carrello");

  // For pickup, the chosen shop must exist and have the store enabled.
  if (input.fulfilment === "pickup") {
    if (!input.shopSlug) throw new Error("Scegli un negozio per il ritiro");
    const shop = await getShopBySlug(input.shopSlug);
    if (!shop) throw new Error("Negozio di ritiro non valido");
    if (!shop.storeEnabled) throw new Error("Questa sede non offre il ritiro in negozio");
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const shippingCents = input.fulfilment === "shipping" ? SHIPPING_CENTS : 0;
  const totalCents = subtotalCents + shippingCents;
  const orderNumber = generateOrderNumber();

  // Insert the order and its line items atomically — no zero-item orders.
  const order = db.transaction((tx) => {
    const [created] = tx
      .insert(orders)
      .values({
        orderNumber,
        userId: userId ?? null,
        email: input.email,
        name: input.name,
        phone: input.phone ?? null,
        status: "pending",
        fulfilment: input.fulfilment,
        shopSlug: input.fulfilment === "pickup" ? input.shopSlug ?? null : null,
        shippingAddress:
          input.fulfilment === "shipping"
            ? { address: input.address ?? "", city: input.city ?? "", zip: input.zip ?? "" }
            : null,
        subtotalCents,
        shippingCents,
        totalCents,
        paymentStatus: "unpaid",
        notes: input.notes ?? null,
      })
      .returning({ id: orders.id })
      .all();

    tx.insert(orderItems)
      .values(
        lines.map((l) => ({
          orderId: created.id,
          productId: l.product.id,
          productSlug: l.product.slug,
          name: l.product.name,
          unitPriceCents: l.unitPriceCents,
          quantity: l.quantity,
          lineTotalCents: l.lineTotalCents,
        })),
      )
      .run();

    return created;
  });

  return {
    orderId: order.id,
    orderNumber,
    totalCents,
    items: lines.map((l) => ({ name: l.product.name, quantity: l.quantity, lineTotalCents: l.lineTotalCents })),
  };
}

export type OrderWithItems = {
  order: typeof orders.$inferSelect;
  items: (typeof orderItems.$inferSelect)[];
};

/**
 * Fetch an order + its items for display, but ONLY for a viewer entitled to see
 * it. Order numbers (`ORD-YYYY-NNNN`) are guessable, so the contents must never
 * be exposed on the number alone. A viewer is entitled when:
 *  - they hold the order's unguessable id as a token (the simulate-checkout
 *    redirect and any owner link carry it), OR
 *  - a server-verified Stripe session resolved to this order in this request, OR
 *  - they are the logged-in customer who placed it.
 * Returns null otherwise (caller shows a generic confirmation with no details).
 */
export async function getOrderForViewer(
  orderNumber: string | undefined,
  opts: { token?: string | null; verifiedOrderId?: string | null; viewerUserId?: string | null },
): Promise<OrderWithItems | null> {
  if (!orderNumber) return null;
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order) return null;

  const entitled =
    (!!opts.token && opts.token === order.id) ||
    (!!opts.verifiedOrderId && opts.verifiedOrderId === order.id) ||
    (!!order.userId && !!opts.viewerUserId && order.userId === opts.viewerUserId);
  if (!entitled) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { order, items };
}

/**
 * Idempotently finalize a paid order: mark paid, email customer + owner, award
 * loyalty points. Safe to call more than once (webhook + success page).
 */
export async function finalizeOrder(orderId: string): Promise<void> {
  // Atomically claim the order: flip unpaid → paid only if it isn't already paid.
  // Only the caller whose UPDATE actually changed a row proceeds to award points
  // and email, so concurrent webhook + success-page calls can't double-accrue.
  const [claimed] = db
    .update(orders)
    .set({ status: "paid", paymentStatus: "paid", updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), ne(orders.paymentStatus, "paid")))
    .returning({ id: orders.id })
    .all();
  if (!claimed) return;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const shop = order.shopSlug ? await getShopBySlug(order.shopSlug) : null;

  const emailData: OrderEmailData = {
    orderNumber: order.orderNumber,
    name: order.name,
    email: order.email,
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, lineTotalCents: i.lineTotalCents })),
    totalCents: order.totalCents,
    fulfilment: order.fulfilment,
    shopName: shop?.name ?? null,
  };

  await Promise.allSettled([
    sendMail({ to: order.email, ...orderCustomerEmail(emailData) }),
    sendMail({ to: env.ownerEmail, ...orderOwnerEmail(emailData) }),
  ]);

  // Loyalty accrual for logged-in customers.
  if (order.userId) {
    const perEuro = await getSetting<number>("loyalty.pointsPerEuro", 1);
    const points = Math.floor((order.subtotalCents / 100) * (perEuro || 1));
    if (points > 0) await addPoints(order.userId, points, `Ordine ${order.orderNumber}`);
  }
}
