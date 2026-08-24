import "server-only";
import { getSetting } from "@/lib/db/queries";
import { env, stripeConfigured } from "@/lib/env";
import type { PaymentAvailability } from "@/lib/payments/methods";

/**
 * Simulated payments: an order is marked paid with no money moving.
 *
 * Gated to an explicit `NODE_ENV=development` and nothing else. It exists so the
 * whole order lifecycle — stock, loyalty, coupons, emails, invoices — is
 * testable offline with no Stripe account. On any other environment (production,
 * staging, or an unset NODE_ENV) a missing secret key means card checkout is
 * *unavailable*, not free: shipping goods for an imaginary payment is a worse
 * failure than refusing the sale.
 */
export const simulatedPayments = !stripeConfigured && env.isDev;

/** Whether a card payment can be taken at all — really, or simulated in dev. */
export const cardCheckoutAvailable = stripeConfigured || simulatedPayments;

/**
 * Which payment methods the shop currently offers, from settings.
 *
 * Card is additionally gated on Stripe actually being usable, so a deploy that
 * has never had its keys set offers "paga in bottega" rather than a card button
 * that dead-ends.
 */
export async function getPaymentAvailability(): Promise<PaymentAvailability> {
  const [inStore, onDelivery, onDeliveryMax, cardSetting] = await Promise.all([
    getSetting<boolean>("payments.inStoreEnabled", true),
    getSetting<boolean>("payments.onDeliveryEnabled", true),
    getSetting<number>("payments.onDeliveryMaxCents", 0),
    getSetting<boolean>("payments.cardEnabled", true),
  ]);
  return {
    cardEnabled: cardSetting && cardCheckoutAvailable,
    inStoreEnabled: inStore,
    onDeliveryEnabled: onDelivery,
    onDeliveryMaxCents: Math.max(0, onDeliveryMax || 0),
  };
}
