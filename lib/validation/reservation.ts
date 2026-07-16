import { z } from "zod";

/**
 * Reservation input validation. One schema covers the three real business flows;
 * per-type required fields are enforced in `superRefine`.
 *  - table:     tavolo / degustazione → date + time + guests
 *  - porchetta: porchetta del sabato  → date + quantityKg
 *  - order:     ordine speciale       → notes describing the request
 */
export const reservationSchema = z
  .object({
    type: z.enum(["table", "porchetta", "order"]).default("table"),
    name: z.string().trim().min(2, "Inserisci il tuo nome").max(120),
    phone: z
      .string()
      .trim()
      .min(6, "Inserisci un numero di telefono valido")
      .max(40),
    email: z
      .union([z.string().trim().email("Email non valida"), z.literal("")])
      .optional()
      .transform((v) => (v ? v : undefined)),
    shop: z.string().trim().min(1, "Seleziona un negozio"),
    date: z.string().trim().optional(),
    time: z.string().trim().optional(),
    guests: z.coerce.number().int().min(1).max(30).optional(),
    quantityKg: z.coerce.number().min(0.5).max(50).optional(),
    notes: z.string().trim().max(2000).optional(),
    // Honeypot — bots fill it. Checked in the route (silent-accept), not rejected here.
    company: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "table") {
      if (!data.date) ctx.addIssue({ code: "custom", message: "Scegli una data", path: ["date"] });
      if (!data.time) ctx.addIssue({ code: "custom", message: "Scegli un orario", path: ["time"] });
      if (data.guests == null)
        ctx.addIssue({ code: "custom", message: "Indica il numero di ospiti", path: ["guests"] });
    }
    if (data.type === "porchetta") {
      if (!data.date) ctx.addIssue({ code: "custom", message: "Scegli il sabato", path: ["date"] });
      if (data.quantityKg == null)
        ctx.addIssue({ code: "custom", message: "Indica la quantità", path: ["quantityKg"] });
    }
    if (data.type === "order" && !data.notes) {
      ctx.addIssue({
        code: "custom",
        message: "Descrivi cosa desideri ordinare",
        path: ["notes"],
      });
    }
  });

export type ReservationInput = z.infer<typeof reservationSchema>;
