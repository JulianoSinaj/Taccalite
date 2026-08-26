import "server-only";
import { instantInRome, dateInRome, BUSINESS_TZ } from "@/lib/time";
import { isClosed, type ClosureLike } from "@/lib/closures";

/**
 * Turning the weekly pickup schedule into the concrete windows a customer can
 * actually choose today.
 *
 * Table bookings have had an agenda since the beginning; pickup orders had
 * nothing — the customer picked "ritiro" and no time at all, so the counter had
 * no way to know that forty people were coming at noon, and an order placed at
 * 19:58 for a shop that shuts at 20:00 was accepted without comment.
 *
 * A shop with no rows in `pickup_slots` keeps exactly that old behaviour: this
 * returns an empty list, the checkout shows no picker, and `pickupSlotAt` stays
 * null. Slots are opt-in per location.
 */

export type SlotLike = {
  id: string;
  shopSlug: string;
  weekday: number; // 1 = Monday … 7 = Sunday
  startTime: string;
  endTime: string;
  capacityOrders: number | null;
  cutoffHours: number;
  active: boolean;
};

export type SlotOption = {
  /** What the form posts: `yyyy-mm-ddTHH:MM`, the window's local start. */
  value: string;
  shopSlug: string;
  date: string;
  startTime: string;
  endTime: string;
  atMs: number;
  /** "giovedì 22 agosto · 10:00–12:30" */
  label: string;
  /** Orders still accepted in this window; null when uncapped. */
  remaining: number | null;
};

/** ISO weekday (1 = Monday … 7 = Sunday) for a `yyyy-mm-dd` date. */
export function isoWeekday(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return js === 0 ? 7 : js;
}

/** Shift a `yyyy-mm-dd` by whole days (UTC math, so DST can't eat a day). */
function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const dayLabel = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("it-IT", {
    timeZone: BUSINESS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/** The key `bookedCounts` is expected to use: shop + the window's start instant. */
export function slotKey(shopSlug: string, atMs: number): string {
  return `${shopSlug}|${atMs}`;
}

/**
 * Every window a customer could still choose, soonest first.
 *
 * Filters out windows already past their cut-off and windows already full — an
 * option the customer can pick and then be refused for is worse than no option.
 */
export function pickupSlotOptions(
  slots: SlotLike[],
  opts: {
    now?: Date;
    days?: number;
    bookedCounts?: Map<string, number>;
    /** Days the shop is shut. A window on a closed day is not offered at all. */
    closures?: ClosureLike[];
  } = {},
): SlotOption[] {
  const now = opts.now ?? new Date();
  const days = opts.days ?? 14;
  const booked = opts.bookedCounts ?? new Map<string, number>();
  const closures = opts.closures ?? [];
  const today = dateInRome(now);
  const out: SlotOption[] = [];

  for (let i = 0; i < days; i++) {
    const date = shiftDate(today, i);
    const weekday = isoWeekday(date);
    for (const s of slots) {
      if (!s.active || s.weekday !== weekday) continue;
      // The schedule recurs weekly and so cannot know about the calendar; a
      // window generated from Thursday's opening hours would otherwise be
      // offered on the Thursday of the August shutdown.
      // The whole window is tested, not just its start: a 12:00–14:00 slot is
      // no use when the shop shuts at 13:00 for the afternoon.
      if (isClosed(closures, s.shopSlug, date, "pickup", { start: s.startTime, end: s.endTime })) continue;
      const at = instantInRome(date, s.startTime);
      const atMs = at.getTime();
      // The cut-off is measured from the moment the window opens, not from the
      // start of that day: "ordina almeno 2 ore prima" means exactly that.
      if (atMs - s.cutoffHours * 3_600_000 <= now.getTime()) continue;
      const taken = booked.get(slotKey(s.shopSlug, atMs)) ?? 0;
      const remaining = s.capacityOrders == null ? null : s.capacityOrders - taken;
      if (remaining != null && remaining <= 0) continue;
      out.push({
        value: `${date}T${s.startTime}`,
        shopSlug: s.shopSlug,
        date,
        startTime: s.startTime,
        endTime: s.endTime,
        atMs,
        label: `${dayLabel(date)} · ${s.startTime}–${s.endTime}`,
        remaining,
      });
    }
  }

  return out.sort((a, b) => a.atMs - b.atMs);
}

export type SlotResolution =
  | { ok: true; atMs: number | null; option: SlotOption | null }
  | { ok: false; error: string };

/**
 * Validate the window the customer posted against the schedule as it stands now.
 *
 * Re-derived rather than trusted: the value travelled through the browser, the
 * schedule may have changed since the page rendered, and the last free place in
 * a capped window may have gone to someone else while the form was open.
 */
export function resolvePickupSlot(
  slots: SlotLike[],
  shopSlug: string,
  raw: string | null | undefined,
  opts: { now?: Date; bookedCounts?: Map<string, number>; closures?: ClosureLike[] } = {},
): SlotResolution {
  const forShop = slots.filter((s) => s.active && s.shopSlug === shopSlug);
  const options = pickupSlotOptions(forShop, { ...opts, days: 21 });

  if (!raw) {
    // No windows configured for this shop means none is required — that is the
    // pre-slot behaviour, and it must keep working.
    if (options.length === 0) return { ok: true, atMs: null, option: null };
    return { ok: false, error: "Scegli un orario di ritiro." };
  }

  const option = options.find((o) => o.value === raw);
  if (!option) {
    return {
      ok: false,
      error: "L'orario di ritiro scelto non è più disponibile. Scegline un altro.",
    };
  }
  return { ok: true, atMs: option.atMs, option };
}

/**
 * A stored `pickupSlotAt` as the shop and the customer would say it.
 *
 * Only the start is stored, deliberately: the window's end lives on the schedule
 * row, which the operator may edit later, and an order's appointment must not
 * move because the weekly hours changed after it was placed.
 */
export function formatSlotLabel(at: Date): string {
  return at.toLocaleString("it-IT", {
    timeZone: BUSINESS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}
