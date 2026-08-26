import { z } from "zod";
import { FULFILMENT_MODES, needsAddress } from "@/lib/fulfilment";
import { CUSTOMER_PAYMENT_METHODS } from "@/lib/payments/methods";

/**
 * A field the client may omit *or* send as `null`.
 *
 * `.optional()` alone accepts a missing key and rejects an explicit null, and
 * `FormData.get` returns null for any input not currently in the DOM — which is
 * exactly what the checkout does with the address block on a pickup order. The
 * result was a 400 on every pickup checkout, carrying Zod's own English
 * "expected string, received null" to an Italian customer. The client no longer
 * sends null; this makes the contract tolerant of it either way, because a
 * hand-rolled JSON endpoint is reachable by more than one client.
 *
 * `preprocess` rather than `.nullish().transform()`: the latter turns the key
 * *required-but-undefined* in the inferred type, so every caller that legitimately
 * omits `address` stops compiling. This keeps the key optional and still enforces
 * `.max()` on a value that is actually present.
 */
const optionalText = (max: number) =>
  z.preprocess((v) => (v === null ? undefined : v), z.string().trim().max(max).optional());

export const checkoutSchema = z
  .object({
    items: z
      .array(z.object({ slug: z.string().min(1), quantity: z.coerce.number().int().min(1).max(50) }))
      .min(1, "Il carrello è vuoto"),
    name: z.string().trim().min(2, "Inserisci il tuo nome").max(120),
    email: z.string().trim().toLowerCase().email("Email non valida"),
    phone: optionalText(40),
    fulfilment: z.enum(FULFILMENT_MODES).default("pickup"),
    /**
     * Shape only. Whether this method is actually *offered* depends on the
     * fulfilment mode, the shop's settings and the server's own total, so the
     * real check lives in `createOrder` where all three are known — and where a
     * refusal can say why in the customer's words.
     */
    paymentMethod: z.enum(CUSTOMER_PAYMENT_METHODS).default("card"),
    shopSlug: optionalText(120),
    /** The chosen pickup window as `yyyy-mm-ddTHH:MM`; re-derived server-side. */
    pickupSlot: optionalText(20),
    address: optionalText(200),
    city: optionalText(120),
    zip: optionalText(20),
    notes: optionalText(1000),
    discountCode: optionalText(40),
    company: z.string().optional(), // honeypot
  })
  .superRefine((d, ctx) => {
    // Local delivery needs an address for exactly the same reason a courier
    // shipment does — someone has to drive to it.
    if (needsAddress(d.fulfilment)) {
      if (!d.address) ctx.addIssue({ code: "custom", message: "Inserisci l'indirizzo", path: ["address"] });
      if (!d.city) ctx.addIssue({ code: "custom", message: "Inserisci la città", path: ["city"] });
      if (!d.zip) ctx.addIssue({ code: "custom", message: "Inserisci il CAP", path: ["zip"] });
    }
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;
