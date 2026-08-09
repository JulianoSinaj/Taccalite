import { NextResponse } from "next/server";
import { gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pageViews } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import {
  getCustomersWithPoints,
  getOrdersForExport,
  getReservationsForExport,
  getSubscribersForExport,
  getAuditForExport,
  getVatReport,
} from "@/lib/admin/queries";
import {
  orderFilters,
  reservationFilters,
  customerFilters,
  subscriberFilters,
  auditFilters,
} from "@/lib/admin/filters";
import { normalizeRange } from "@/lib/analytics";
import { vatRateLabel } from "@/lib/fiscal";
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
  // The export mirrors whatever the operator has filtered to on screen: the list
  // pages append their active filters to the download link, and both sides read
  // them through the same `lib/admin/filters` helpers.
  const params = new URL(request.url).searchParams;
  let csv: string;

  switch (entity) {
    case "orders": {
      const rows = await getOrdersForExport(orderFilters(params));
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
      const rows = await getCustomersWithPoints(customerFilters(params));
      csv = toCsv(
        ["username", "name", "email", "phone", "role", "points", "cardNumber", "joined"],
        rows.map((c) => [c.username, c.name, c.email, c.phone, c.role, c.points ?? 0, c.cardNumber, iso(c.createdAt)]),
      );
      break;
    }
    case "reservations": {
      const rows = await getReservationsForExport(reservationFilters(params));
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
      const rows = await getSubscribersForExport(subscriberFilters(params));
      csv = toCsv(
        ["email", "status", "source", "confirmedAt", "created"],
        rows.map((s) => [s.email, s.status, s.source, iso(s.confirmedAt), iso(s.createdAt)]),
      );
      break;
    }
    case "audit": {
      const rows = await getAuditForExport(auditFilters(params));
      csv = toCsv(
        ["timestamp", "actor", "action", "entity", "entityId", "summary", "meta"],
        rows.map((r) => [
          iso(r.createdAt),
          r.actorName,
          r.action,
          r.entity,
          r.entityId,
          r.summary,
          r.meta ? JSON.stringify(r.meta) : "",
        ]),
      );
      break;
    }
    case "analytics": {
      const range = normalizeRange(params.get("giorni"));
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
      const da = params.get("da");
      const a = params.get("a");
      const now = new Date();
      const from = da ? new Date(`${da}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
      const to = a ? new Date(`${a}T23:59:59`) : now;
      const { buckets } = await getVatReport(from, to);
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
