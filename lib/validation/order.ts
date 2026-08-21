import { z } from "zod";
import { FULFILMENT_MODES, needsAddress } from "@/lib/fulfilment";

export const checkoutSchema = z
  .object({
    items: z
      .array(z.object({ slug: z.string().min(1), quantity: z.coerce.number().int().min(1).max(50) }))
      .min(1, "Il carrello è vuoto"),
    name: z.string().trim().min(2, "Inserisci il tuo nome").max(120),
    email: z.string().trim().toLowerCase().email("Email non valida"),
    phone: z.string().trim().max(40).optional(),
    fulfilment: z.enum(FULFILMENT_MODES).default("pickup"),
    shopSlug: z.string().trim().optional(),
    /** The chosen pickup window as `yyyy-mm-ddTHH:MM`; re-derived server-side. */
    pickupSlot: z.string().trim().max(20).optional(),
    address: z.string().trim().max(200).optional(),
    city: z.string().trim().max(120).optional(),
    zip: z.string().trim().max(20).optional(),
    notes: z.string().trim().max(1000).optional(),
    discountCode: z.string().trim().max(40).optional(),
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
