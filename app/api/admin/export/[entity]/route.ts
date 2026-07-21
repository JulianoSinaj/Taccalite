import { NextResponse } from "next/server";
import { desc, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, reservations, newsletterSubscribers, pageViews } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { getCustomersWithPoints, getVatReport } from "@/lib/admin/queries";
import { normalizeRange } from "@/lib/analytics";
import { getSetting } from "@/lib/db/queries";
import { vatBreakdown, vatRateLabel } from "@/lib/fiscal";
import { toCsv } from "@/lib/csv";

export const runtime = "nodejs";

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : "");
const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request, ctx: { params: Promise<{ entity: string }> }) {
  try {
    // Bulk CSV export is a mass-PII operation — full admins only, not staff.
    await requireRole("admin");
  } catch {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
  }

  const { entity } = await ctx.params;
  let csv: string;

  switch (entity) {
    case "orders": {
      const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));
      csv = toCsv(
        ["orderNumber", "date", "name", "email", "phone", "status", "paymentStatus", "fulfilment", "shop", "totalEuros"],
        rows.map((o) => [
          o.orderNumber, iso(o.createdAt), o.name, o.email, o.phone, o.status,
          o.paymentStatus, o.fulfilment, o.shopSlug, (o.totalCents / 100).toFixed(2),
        ]),
      );
      break;
    }
    case "customers": {
      const rows = await getCustomersWithPoints();
      csv = toCsv(
        ["username", "name", "email", "phone", "role", "points", "cardNumber", "joined"],
        rows.map((c) => [c.username, c.name, c.email, c.phone, c.role, c.points ?? 0, c.cardNumber, iso(c.createdAt)]),
      );
      break;
    }
    case "reservations": {
      const rows = await db.select().from(reservations).orderBy(desc(reservations.createdAt));
      csv = toCsv(
        ["reference", "date", "type", "name", "phone", "email", "shop", "status", "guests", "quantityKg", "created"],
        rows.map((r) => [
          r.reference, r.date, r.type, r.name, r.phone, r.email, r.shopSlug, r.status,
          r.guests, r.quantityKg, iso(r.createdAt),
        ]),
      );
      break;
    }
    case "subscribers": {
      const rows = await db.select().from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.createdAt));
      csv = toCsv(
        ["email", "status", "source", "confirmedAt", "created"],
        rows.map((s) => [s.email, s.status, s.source, iso(s.confirmedAt), iso(s.createdAt)]),
      );
      break;
    }
    case "analytics": {
      const range = normalizeRange(new URL(request.url).searchParams.get("giorni"));
      const since = new Date(Date.now() - range * DAY_MS);
      const dayExpr = sql<string>`date(${pageViews.createdAt} / 1000, 'unixepoch')`;
      const rows = await db
        .select({ day: dayExpr, n: sql<number>`count(*)` })
        .from(pageViews)
        .where(gte(pageViews.createdAt, since))
        .groupBy(dayExpr)
        .orderBy(dayExpr);
      csv = toCsv(
        ["date", "views"],
        rows.map((r) => [r.day, r.n]),
      );
      break;
    }
    case "iva": {
      const sp = new URL(request.url).searchParams;
      const da = sp.get("da");
      const a = sp.get("a");
      const now = new Date();
      const from = da ? new Date(`${da}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
      const to = a ? new Date(`${a}T23:59:59`) : now;
      const [{ lines, shippingGrossCents }, shippingVatPct] = await Promise.all([
        getVatReport(from, to),
        getSetting<number>("store.shippingVatRate", 22),
      ]);
      const buckets = vatBreakdown([
        ...lines.map((l) => ({ grossCents: l.grossCents, vatRateBps: l.vatRateBps })),
        ...(shippingGrossCents > 0
          ? [{ grossCents: shippingGrossCents, vatRateBps: Math.round(shippingVatPct * 100) }]
          : []),
      ]);
      csv = toCsv(
        ["aliquota", "imponibileEuros", "impostaEuros", "totaleIvatoEuros"],
        buckets.map((b) => [
          vatRateLabel(b.rateBps),
          (b.imponibileCents / 100).toFixed(2),
          (b.impostaCents / 100).toFixed(2),
          (b.grossCents / 100).toFixed(2),
        ]),
      );
      break;
    }
    default:
      return NextResponse.json({ ok: false, error: "Entità non valida" }, { status: 404 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="taccalite-${entity}.csv"`,
    },
  });
}
