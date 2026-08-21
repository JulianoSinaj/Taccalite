"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deliveryZones, pickupSlots, orders, shops } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm, deliveryZoneInput, pickupSlotInput } from "@/lib/validation/admin";
import { FULFILMENT_LABEL, WEEKDAY_NAME } from "@/lib/fulfilment";

/**
 * Delivery zones and pickup windows.
 *
 * Both are configuration that prices or schedules real orders, so both follow the
 * same rule the taxonomy does: a row that has been used is never silently
 * removed. A zone is RESTRICTed by the foreign key on `orders.delivery_zone_id`
 * and a used one can only be deactivated; a window has no such link (the order
 * stores the resolved instant, not the slot id) so deleting one is safe and
 * changes no appointment already made.
 */

const REVALIDATE = ["/admin/fulfilment", "/admin/fulfilment/oggi", "/checkout"];
const revalidateAll = () => REVALIDATE.forEach((p) => revalidatePath(p));

export async function saveDeliveryZone(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(deliveryZoneInput, fd);

    if (d.shopSlug) {
      const [shop] = await db.select().from(shops).where(eq(shops.slug, d.shopSlug)).limit(1);
      if (!shop) throw new ActionError("Sede non valida.");
    }

    // A threshold of zero would read as "always free", which is never what an
    // empty field meant. Null is "mai gratis".
    const freeOverCents = d.freeOverEuros && d.freeOverEuros > 0 ? d.freeOverEuros : null;

    const values = {
      name: d.name,
      mode: d.mode,
      postcodes: d.postcodes,
      shopSlug: d.shopSlug ?? null,
      feeCents: d.feeEuros ?? 0,
      freeOverCents,
      minOrderCents: d.minOrderEuros ?? 0,
      perKgCents: d.perKgEuros && d.perKgEuros > 0 ? d.perKgEuros : null,
      leadTimeHours: d.leadTimeHours ?? 0,
      note: d.note ?? "",
      sortOrder: d.sortOrder ?? 0,
      active: d.active,
    };

    if (d.id) {
      const [prev] = await db.select().from(deliveryZones).where(eq(deliveryZones.id, d.id)).limit(1);
      if (!prev) throw new ActionError("Zona non trovata.");
      await db.update(deliveryZones).set(values).where(eq(deliveryZones.id, d.id));
      await logAudit({
        actor,
        action: "fulfilment.zone.update",
        entity: "delivery_zone",
        entityId: d.id,
        summary: `Zona aggiornata: ${d.name} (${FULFILMENT_LABEL[d.mode]})`,
        meta: { mode: d.mode, feeCents: values.feeCents, postcodes: d.postcodes.length },
      });
      revalidateAll();
      return ok("Zona salvata.");
    }

    const [created] = await db.insert(deliveryZones).values(values).returning({ id: deliveryZones.id });
    await logAudit({
      actor,
      action: "fulfilment.zone.create",
      entity: "delivery_zone",
      entityId: created?.id,
      summary: `Zona creata: ${d.name} (${FULFILMENT_LABEL[d.mode]})`,
      meta: { mode: d.mode, feeCents: values.feeCents, postcodes: d.postcodes.length },
    });
    revalidateAll();
    return ok("Zona creata.");
  });
}

export async function toggleDeliveryZoneActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "");
    const active = fd.get("active") === "true";
    const [row] = await db
      .update(deliveryZones)
      .set({ active })
      .where(eq(deliveryZones.id, id))
      .returning({ name: deliveryZones.name });
    if (!row) throw new ActionError("Zona non trovata.");
    await logAudit({
      actor,
      action: "fulfilment.zone.active",
      entity: "delivery_zone",
      entityId: id,
      summary: `Zona ${row.name} ${active ? "riattivata" : "sospesa"}`,
      meta: { active },
    });
    revalidateAll();
    return ok(active ? "Zona riattivata." : "Zona sospesa: non è più offerta al checkout.");
  });
}

export async function deleteDeliveryZone(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "");
    const [row] = await db.select().from(deliveryZones).where(eq(deliveryZones.id, id)).limit(1);
    if (!row) throw new ActionError("Zona non trovata.");

    // The foreign key would refuse this anyway; checking first turns "FOREIGN KEY
    // constraint failed" into a sentence that names the alternative.
    const [used] = await db
      .select({ n: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.deliveryZoneId, id));
    if (Number(used?.n ?? 0) > 0) {
      throw new ActionError(
        `«${row.name}» ha già servito ${used.n} ordini e non può essere eliminata — ` +
          "sospendila per toglierla dal checkout senza perdere lo storico.",
      );
    }

    await db.delete(deliveryZones).where(eq(deliveryZones.id, id));
    await logAudit({
      actor,
      action: "fulfilment.zone.delete",
      entity: "delivery_zone",
      entityId: id,
      summary: `Zona eliminata: ${row.name}`,
      meta: { mode: row.mode },
    });
    revalidateAll();
    return ok("Zona eliminata.");
  });
}

export async function savePickupSlot(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(pickupSlotInput, fd);

    const [shop] = await db.select().from(shops).where(eq(shops.slug, d.shopSlug)).limit(1);
    if (!shop) throw new ActionError("Sede non valida.");

    const values = {
      shopSlug: d.shopSlug,
      weekday: d.weekday,
      startTime: d.startTime,
      endTime: d.endTime,
      capacityOrders: d.capacityOrders && d.capacityOrders > 0 ? d.capacityOrders : null,
      cutoffHours: d.cutoffHours ?? 2,
      active: d.active,
    };

    if (d.id) {
      await db.update(pickupSlots).set(values).where(eq(pickupSlots.id, d.id));
    } else {
      const clash = await db
        .select({ id: pickupSlots.id })
        .from(pickupSlots)
        .where(
          and(
            eq(pickupSlots.shopSlug, d.shopSlug),
            eq(pickupSlots.weekday, d.weekday),
            eq(pickupSlots.startTime, d.startTime),
          ),
        );
      if (clash.length > 0) {
        throw new ActionError("Esiste già una fascia che inizia a quest'ora in questo giorno.");
      }
      await db.insert(pickupSlots).values(values);
    }

    await logAudit({
      actor,
      action: d.id ? "fulfilment.slot.update" : "fulfilment.slot.create",
      entity: "pickup_slot",
      entityId: d.id,
      summary: `Fascia di ritiro ${d.id ? "aggiornata" : "creata"}: ${shop.name}, ${WEEKDAY_NAME[d.weekday]} ${d.startTime}–${d.endTime}`,
      meta: values,
    });
    revalidateAll();
    return ok("Fascia salvata.");
  });
}

export async function deletePickupSlot(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "");
    const [row] = await db.select().from(pickupSlots).where(eq(pickupSlots.id, id)).limit(1);
    if (!row) throw new ActionError("Fascia non trovata.");

    // Safe by construction: an order stores the instant it booked, not this row,
    // so removing a window never moves an appointment already made. It only
    // stops the window being offered again.
    await db.delete(pickupSlots).where(eq(pickupSlots.id, id));
    await logAudit({
      actor,
      action: "fulfilment.slot.delete",
      entity: "pickup_slot",
      entityId: id,
      summary: `Fascia di ritiro eliminata: ${row.shopSlug}, ${WEEKDAY_NAME[row.weekday]} ${row.startTime}–${row.endTime}`,
      meta: { shopSlug: row.shopSlug, weekday: row.weekday },
    });
    revalidateAll();
    return ok("Fascia eliminata. Gli ordini già prenotati mantengono il loro orario.");
  });
}

/** Split "HH:MM" into minutes since midnight, and back. */
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toClock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Build a week of pickup windows from the shop's own opening hours.
 *
 * Writing twenty windows by hand is the reason a feature like this goes
 * unconfigured, and the hours are already structured data (`shops.hoursStructured`,
 * added when "aperto adesso" stopped being parsed from prose). Re-running is an
 * upsert on (sede, giorno, inizio), so adjusting the length and generating again
 * corrects the schedule instead of duplicating it.
 */
export async function generatePickupSlots(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const shopSlug = String(fd.get("shopSlug") ?? "");
    const minutes = Math.min(240, Math.max(15, Number(fd.get("minutes")) || 60));
    const capacityRaw = Number(fd.get("capacityOrders"));
    const capacityOrders = Number.isFinite(capacityRaw) && capacityRaw > 0 ? Math.floor(capacityRaw) : null;
    const cutoffRaw = Number(fd.get("cutoffHours"));
    const cutoffHours = Number.isFinite(cutoffRaw) && cutoffRaw >= 0 ? Math.floor(cutoffRaw) : 2;

    const [shop] = await db.select().from(shops).where(eq(shops.slug, shopSlug)).limit(1);
    if (!shop) throw new ActionError("Sede non valida.");
    const hours = shop.hoursStructured;
    if (!hours || hours.length === 0) {
      throw new ActionError(
        `${shop.name} non ha orari di apertura strutturati: impostali in Negozi, oppure aggiungi le fasce a mano.`,
      );
    }

    const rows: (typeof pickupSlots.$inferInsert)[] = [];
    for (const day of hours) {
      if (day.day < 1 || day.day > 7) continue;
      for (const range of day.ranges ?? []) {
        const open = toMinutes(range.open);
        const close = toMinutes(range.close);
        if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open) continue;
        // Only whole windows: a 20-minute stub at the end of the morning is not
        // a slot anyone would choose, and it would collide with lunch.
        for (let t = open; t + minutes <= close; t += minutes) {
          rows.push({
            shopSlug,
            weekday: day.day,
            startTime: toClock(t),
            endTime: toClock(t + minutes),
            capacityOrders,
            cutoffHours,
            active: true,
          });
        }
      }
    }

    if (rows.length === 0) {
      throw new ActionError(
        "Gli orari di apertura non contengono nessuna fascia abbastanza lunga: prova una durata più breve.",
      );
    }

    await db
      .insert(pickupSlots)
      .values(rows)
      .onConflictDoUpdate({
        target: [pickupSlots.shopSlug, pickupSlots.weekday, pickupSlots.startTime],
        set: {
          endTime: sql`excluded.end_time`,
          capacityOrders: sql`excluded.capacity_orders`,
          cutoffHours: sql`excluded.cutoff_hours`,
          active: sql`excluded.active`,
        },
      });

    await logAudit({
      actor,
      action: "fulfilment.slot.generate",
      entity: "pickup_slot",
      entityId: shopSlug,
      summary: `Fasce di ritiro generate per ${shop.name}: ${rows.length} da ${minutes} min`,
      meta: { shopSlug, minutes, capacityOrders, cutoffHours, count: rows.length },
    });
    revalidateAll();
    return ok(`${rows.length} fasce generate dagli orari di apertura di ${shop.name}.`);
  });
}
