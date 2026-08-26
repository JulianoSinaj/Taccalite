"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deliveryZones, pickupSlots, orders, shops, shopClosures, reservations } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm, deliveryZoneInput, pickupSlotInput, shopClosureInput } from "@/lib/validation/admin";
import { FULFILMENT_LABEL, WEEKDAY_NAME } from "@/lib/fulfilment";
import { enqueueMail } from "@/lib/mail/mailer";
import { closureNoticeEmail } from "@/lib/mail/templates";
import { dateInRome } from "@/lib/time";

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

/**
 * A closure reaches further than a zone or a window: it also decides which
 * dates the public booking form will accept, and which bookings the back office
 * shows a warning against.
 */
const revalidateClosures = () => {
  revalidateAll();
  revalidatePath("/admin/chiusure");
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/reservations/calendar");
  revalidatePath("/prenotazioni");
};

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
      const [prev] = await db
        .select({ id: pickupSlots.id })
        .from(pickupSlots)
        .where(eq(pickupSlots.id, d.id))
        .limit(1);
      if (!prev) throw new ActionError("Fascia non trovata.");
    }

    // The unique index would refuse this anyway; checking first turns a
    // constraint name into a sentence. On update the row's own start is not a
    // clash with itself.
    const clash = await db
      .select({ id: pickupSlots.id })
      .from(pickupSlots)
      .where(
        and(
          eq(pickupSlots.shopSlug, d.shopSlug),
          eq(pickupSlots.weekday, d.weekday),
          eq(pickupSlots.startTime, d.startTime),
          d.id ? ne(pickupSlots.id, d.id) : undefined,
        ),
      );
    if (clash.length > 0) {
      throw new ActionError("Esiste già una fascia che inizia a quest'ora in questo giorno.");
    }

    if (d.id) {
      await db.update(pickupSlots).set(values).where(eq(pickupSlots.id, d.id));
    } else {
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

/**
 * Suspend or reactivate every window of one shop at once.
 *
 * With every window suspended the checkout offers no picker and pickup falls
 * back to "no time" — the same as a shop that never had windows — so this is
 * the way to pause timed pickup without losing the schedule.
 */
export async function setShopPickupSlotsActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const shopSlug = String(fd.get("shopSlug") ?? "").trim();
    const active = fd.get("active") === "true";
    const [shop] = await db.select().from(shops).where(eq(shops.slug, shopSlug)).limit(1);
    if (!shop) throw new ActionError("Sede non valida.");

    const changed = await db
      .update(pickupSlots)
      .set({ active })
      .where(and(eq(pickupSlots.shopSlug, shopSlug), eq(pickupSlots.active, !active)))
      .returning({ id: pickupSlots.id });
    if (changed.length === 0) {
      return ok(active ? "Nessuna fascia da riattivare." : "Nessuna fascia da sospendere.");
    }

    await logAudit({
      actor,
      action: active ? "fulfilment.slot.activate_all" : "fulfilment.slot.suspend_all",
      entity: "pickup_slot",
      entityId: shopSlug,
      summary: `Fasce di ritiro di ${shop.name} ${active ? "riattivate" : "sospese"}: ${changed.length}`,
      meta: { shopSlug, active, count: changed.length },
    });
    revalidateAll();
    return ok(
      active
        ? `${changed.length} fasce riattivate.`
        : `${changed.length} fasce sospese: il ritiro da ${shop.name} torna senza orario finché non le riattivi.`,
    );
  });
}

/** Remove every window of one shop. Same safety as the single delete: no
 *  appointment already made moves, the windows just stop being offered. */
export async function deleteShopPickupSlots(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const shopSlug = String(fd.get("shopSlug") ?? "").trim();
    const [shop] = await db.select().from(shops).where(eq(shops.slug, shopSlug)).limit(1);
    if (!shop) throw new ActionError("Sede non valida.");

    const removed = await db
      .delete(pickupSlots)
      .where(eq(pickupSlots.shopSlug, shopSlug))
      .returning({ id: pickupSlots.id });
    if (removed.length === 0) return ok("Nessuna fascia da eliminare.");

    await logAudit({
      actor,
      action: "fulfilment.slot.delete_all",
      entity: "pickup_slot",
      entityId: shopSlug,
      summary: `Fasce di ritiro di ${shop.name} eliminate: ${removed.length}`,
      meta: { shopSlug, count: removed.length },
    });
    revalidateAll();
    return ok(`${removed.length} fasce eliminate. Gli ordini già prenotati mantengono il loro orario.`);
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
 * added when "aperto adesso" stopped being parsed from prose).
 *
 * Generating *replaces* the shop's whole schedule. An upsert on (sede, giorno,
 * inizio) looked gentler but left stubs: going from 30- to 60-minute windows
 * updated the :00 rows and kept the :30 ones, so the customer was offered two
 * overlapping windows. A schedule derived from the hours has to be exactly that.
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

    // One transaction: the old schedule must not be gone while the new one has
    // yet to land, or a checkout in that instant sees a shop with no windows.
    const replaced = await db.transaction(async (tx) => {
      const old = await tx
        .delete(pickupSlots)
        .where(eq(pickupSlots.shopSlug, shopSlug))
        .returning({ id: pickupSlots.id });
      await tx.insert(pickupSlots).values(rows);
      return old.length;
    });

    await logAudit({
      actor,
      action: "fulfilment.slot.generate",
      entity: "pickup_slot",
      entityId: shopSlug,
      summary: `Fasce di ritiro generate per ${shop.name}: ${rows.length} da ${minutes} min (${replaced} sostituite)`,
      meta: { shopSlug, minutes, capacityOrders, cutoffHours, count: rows.length, replaced },
    });
    revalidateAll();
    return ok(
      `${rows.length} fasce generate dagli orari di apertura di ${shop.name}` +
        (replaced > 0 ? ` (${replaced} precedenti sostituite).` : "."),
    );
  });
}

// ── Closures (chiusure) ──────────────────────────────────────────────────────
/**
 * Days the shop is shut.
 *
 * Unlike a zone or a window, a closure is not configuration that prices
 * something — it is a fact about the calendar, and the only reason it lives in
 * this module is that its two consumers (the booking gate and the pickup
 * window generator) are the two things this module already governs.
 *
 * Deleting one is always safe: nothing references it, and the bookings taken
 * before it existed keep their dates. That is deliberate — a closure declared
 * after the fact must not silently cancel appointments people are expecting the
 * shop to keep. The page lists what is already booked inside the range instead,
 * so the operator can call them.
 */
export async function saveClosure(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(shopClosureInput, fd);

    if (d.shopSlug) {
      const [shop] = await db.select().from(shops).where(eq(shops.slug, d.shopSlug)).limit(1);
      if (!shop) throw new ActionError("Sede non valida.");
    }

    const values = {
      shopSlug: d.shopSlug ?? null,
      fromDate: d.fromDate,
      // One day is the common case and typing the same date twice is friction,
      // so an empty end means "just that day".
      toDate: d.toDate || d.fromDate,
      reason: d.reason ?? "",
      blocksReservations: d.blocksReservations,
      blocksPickup: d.blocksPickup,
    };

    // The list only shows closures from today on, so one that already ended
    // would be saved, confirmed, and then never seen again.
    if (values.toDate < dateInRome()) {
      throw new ActionError("La chiusura finisce nel passato: se non serve più, rimuovila.");
    }

    const scope = d.shopSlug ? d.shopSlug : "tutte le sedi";
    const when =
      values.fromDate === values.toDate
        ? `il ${values.fromDate}`
        : `dal ${values.fromDate} al ${values.toDate}`;

    if (d.id) {
      const [prev] = await db.select().from(shopClosures).where(eq(shopClosures.id, d.id)).limit(1);
      if (!prev) throw new ActionError("Chiusura non trovata.");
      await db.update(shopClosures).set(values).where(eq(shopClosures.id, d.id));
      await logAudit({
        actor,
        action: "closure.update",
        entity: "closure",
        entityId: d.id,
        summary: `Chiusura aggiornata: ${scope}, ${when}`,
        meta: { from: { fromDate: prev.fromDate, toDate: prev.toDate }, to: values },
      });
    } else {
      const [created] = await db.insert(shopClosures).values(values).returning({ id: shopClosures.id });
      await logAudit({
        actor,
        action: "closure.create",
        entity: "closure",
        entityId: created.id,
        summary: `Chiusura registrata: ${scope}, ${when}${values.reason ? ` — ${values.reason}` : ""}`,
        meta: values,
      });
    }

    revalidateClosures();
    return ok(d.id ? "Chiusura aggiornata." : "Chiusura registrata.");
  });
}

/** Remove a closure — the day reopens immediately, everywhere. */
export async function deleteClosure(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();
    const [row] = await db.select().from(shopClosures).where(eq(shopClosures.id, id)).limit(1);
    if (!row) throw new ActionError("Chiusura non trovata.");

    await db.delete(shopClosures).where(eq(shopClosures.id, id));
    await logAudit({
      actor,
      action: "closure.delete",
      entity: "closure",
      entityId: id,
      summary: `Chiusura rimossa: ${row.shopSlug ?? "tutte le sedi"}, ${
        row.fromDate === row.toDate ? `il ${row.fromDate}` : `dal ${row.fromDate} al ${row.toDate}`
      }`,
      meta: { fromDate: row.fromDate, toDate: row.toDate, shopSlug: row.shopSlug },
    });

    revalidateClosures();
    return ok("Chiusura rimossa. Le date tornano prenotabili.");
  });
}

/**
 * Warn the customers already booked inside a closure.
 *
 * The closures page has always counted them and then said "avvisa i clienti
 * prima" — handing the operator a filtered list and a telephone. Adding a
 * closure after bookings were taken is the normal case, not the exception, so
 * the notice belongs here.
 *
 * Bookings are **not** cancelled. A closure is the shop's decision about a day;
 * whether a particular customer is moved, refunded or rung back is a
 * conversation, and mass-cancelling would destroy the record of what was owed.
 * The email says the date is unavailable and asks them to get in touch.
 */
export async function notifyClosureBookings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();

    const [closure] = await db.select().from(shopClosures).where(eq(shopClosures.id, id)).limit(1);
    if (!closure) throw new ActionError("Chiusura non trovata.");

    const affected = await db
      .select()
      .from(reservations)
      .where(
        and(
          gte(reservations.date, closure.fromDate),
          lte(reservations.date, closure.toDate),
          sql`${reservations.status} not in ('cancelled', 'no_show')`,
          isNotNull(reservations.email),
          closure.shopSlug ? eq(reservations.shopSlug, closure.shopSlug) : undefined,
        ),
      );

    if (affected.length === 0) {
      return ok("Nessuna prenotazione con email in queste date.");
    }

    const shopNames = new Map((await db.select().from(shops)).map((s) => [s.slug, s.name]));
    let sent = 0;
    for (const r of affected) {
      if (!r.email) continue;
      const built = closureNoticeEmail({
        reference: r.reference,
        name: r.name,
        date: r.date,
        time: r.time,
        shopName: shopNames.get(r.shopSlug) ?? r.shopSlug,
        reason: closure.reason,
      });
      // Queued rather than sent inline: a busy weekend can be dozens of
      // messages, and one bad address must not abort the rest.
      await enqueueMail({ to: r.email, ...built });
      sent += 1;
    }

    await logAudit({
      actor,
      action: "closure.notify",
      entity: "closure",
      entityId: closure.id,
      summary: `Avviso di chiusura (${closure.fromDate}–${closure.toDate}) inviato a ${sent} ${
        sent === 1 ? "cliente" : "clienti"
      }`,
      meta: { sent, fromDate: closure.fromDate, toDate: closure.toDate },
    });

    revalidatePath("/admin/chiusure");
    return ok(
      `Avviso in coda per ${sent} ${sent === 1 ? "cliente" : "clienti"}. Le prenotazioni restano attive: decidi tu se spostarle o annullarle.`,
    );
  });
}
