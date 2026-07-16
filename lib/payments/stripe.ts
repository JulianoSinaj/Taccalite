import "server-only";
import Stripe from "stripe";
import { env, stripeConfigured } from "@/lib/env";

/**
 * Stripe client, lazily created. Returns null when no secret key is set, so the
 * checkout can fall back to "simulate" mode and remain fully testable offline.
 */
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!stripeConfigured) return null;
  if (client) return client;
  client = new Stripe(env.stripe.secretKey); // use SDK-pinned API version
  return client;
}
