import "server-only";
import { customAlphabet } from "nanoid";
import { and, eq, inArray } from "drizzle-orm";
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

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const shippingCents = input.fulfilment === "shipping" ? SHIPPING_CENTS : 0;
  const totalCents = subtotalCents + shippingCents;
  const orderNumber = generateOrderNumber();

  const [order] = await db
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
    .returning({ id: orders.id });

  await db.insert(orderItems).values(
    lines.map((l) => ({
      orderId: order.id,
      productId: l.product.id,
      productSlug: l.product.slug,
      name: l.product.name,
      unitPriceCents: l.unitPriceCents,
      quantity: l.quantity,
      lineTotalCents: l.lineTotalCents,
    })),
  );

  return {
    orderId: order.id,
    orderNumber,
    totalCents,
    items: lines.map((l) => ({ name: l.product.name, quantity: l.quantity, lineTotalCents: l.lineTotalCents })),
  };
}

/**
 * Idempotently finalize a paid order: mark paid, email customer + owner, award
 * loyalty points. Safe to call more than once (webhook + success page).
 */
export async function finalizeOrder(orderId: string): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.paymentStatus === "paid") return;

  await db
    .update(orders)
    .set({ status: "paid", paymentStatus: "paid", updatedAt: new Date() })
    .where(eq(orders.id, orderId));

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
