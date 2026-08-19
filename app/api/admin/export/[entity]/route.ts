import { NextResponse } from "next/server";
import { gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pageViews } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import {
  getCustomersWithPoints,
  getOrdersForExport,
  getProductsForExport,
  getReservationsForExport,
  getSubscribersForExport,
  getAuditForExport,
  getVatReport,
} from "@/lib/admin/queries";
import {
  orderFilters,
  reservationFilters,
  customerFilters,
  productFilters,
  subscriberFilters,
  auditFilters,
} from "@/lib/admin/filters";
import { getSetting } from "@/lib/db/queries";
import { normalizeRange, getAnalyticsSummary } from "@/lib/analytics";
import { vatRateLabel } from "@/lib/fiscal";
import { vatPeriod } from "@/lib/fiscal-period";
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
    case "products": {
      // Round-trips with the importer: the same headers, in the same order, so a
      // price list can be exported, edited in a spreadsheet and pushed back.
      const lowStockThreshold = await getSetting<number>("store.lowStockThreshold", 5);
      const rows = await getProductsForExport(productFilters(params), lowStockThreshold);
      csv = toCsv(
        [
          "slug", "nome", "sede", "categoria", "prezzoEuros", "costoEuros", "ivaPercento",
          "unita", "aPeso", "giacenza", "sogliaRiordino", "sku", "fornitore",
          "acquistabile", "attivo", "inEvidenza", "ordine",
        ],
        rows.map((p) => [
          p.slug, p.name, p.shopSlug, p.category,
          p.priceCents != null ? (p.priceCents / 100).toFixed(2) : "",
          p.costCents != null ? (p.costCents / 100).toFixed(2) : "",
          p.vatRateBps / 100,
          p.unit ?? "", p.soldByWeight ? "si" : "no",
          p.stock ?? "", p.reorderPoint ?? "", p.sku ?? "", p.supplier ?? "",
          p.purchasable ? "si" : "no", p.active ? "si" : "no", p.featured ? "si" : "no",
          p.sortOrder,
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
      const daily = await db
        .select({ day: dayExpr, n: sql<number>`count(*)` })
        .from(pageViews)
        .where(gte(pageViews.createdAt, since))
        .groupBy(dayExpr)
        .orderBy(dayExpr);
      // Everything the page shows, not just the daily counts: top paths and
      // referrers used to be visible on screen and impossible to take away.
      const summary = await getAnalyticsSummary(new Date(), range);
      csv = toCsv(
        ["sezione", "chiave", "valore"],
        [
          ...daily.map((r) => ["Visite giornaliere", r.day, r.n]),
          ...summary.topPaths.map((p) => ["Pagine più viste", p.path, p.n]),
          ...summary.topReferrers.map((r) => ["Provenienza", r.referrer ?? "—", r.n]),
          ["Riepilogo", `Visite ${range} giorni`, summary.views],
          ["Riepilogo", `Ordini ${range} giorni`, summary.orders],
          ["Riepilogo", `Incasso ${range} giorni (€)`, (summary.revenueCents / 100).toFixed(2)],
        ],
      );
      break;
    }
    case "iva": {
      // Same bounds resolver as the on-screen report, so the CSV can never
      // disagree with the page it was downloaded from.
      const period = vatPeriod({
        da: params.get("da") ?? undefined,
        a: params.get("a") ?? undefined,
        periodo: params.get("periodo") ?? undefined,
      });
      const report = await getVatReport(period.from, period.toExclusive);
      // One row per rate per section, so the commercialista can see the credit
      // notes rather than only their net effect.
      const section = (label: string, buckets: typeof report.buckets) =>
        buckets.map((b) => [
          label,
          vatRateLabel(b.rateBps),
          (b.imponibileCents / 100).toFixed(2),
          (b.impostaCents / 100).toFixed(2),
          (b.grossCents / 100).toFixed(2),
        ]);
      csv = toCsv(
        ["sezione", "aliquota", "imponibileEuros", "impostaEuros", "totaleIvatoEuros"],
        [
          ...section("Vendite", report.sales),
          ...section("Note di credito", report.reversals),
          ...section("Netto periodo", report.buckets),
        ],
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
