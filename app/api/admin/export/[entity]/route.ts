import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import {
  getCustomersWithPoints,
  getOrdersForExport,
  getProductsForExport,
  getReservationsForExport,
  getSubscribersForExport,
  getAuditForExport,
  getOutboxForExport,
  getVatReport,
  getOrderItemsForExport,
  getStockMovementsForExport,
  getBatchesForExport,
  getLoyaltyForExport,
  getDiscountUsageForExport,
  getInvoiceRegister,
  getSalesAnalysis,
  adminGetShops,
} from "@/lib/admin/queries";
import {
  orderFilters,
  reservationFilters,
  customerFilters,
  productFilters,
  subscriberFilters,
  auditFilters,
  outboxFilters,
  invoiceRegisterStatus,
  invoiceRegisterMatches,
} from "@/lib/admin/filters";
import { getSetting } from "@/lib/db/queries";
import { normalizeRange, getAnalyticsSummary } from "@/lib/analytics";
import { vatRateLabel } from "@/lib/fiscal";
import { vatPeriod } from "@/lib/fiscal-period";
import { marginPct, type SalesGroup } from "@/lib/sales-analysis";
import { toCsv, streamCsv } from "@/lib/csv";

export const runtime = "nodejs";

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : "");

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
  // Row dumps stream: they are unbounded by nature, so they are pulled from the
  // database a page at a time instead of being materialised whole. The two
  // aggregate reports below are already bounded (a fixed number of buckets, a
  // capped top-N) and stay plain strings.
  let body: string | ReadableStream<Uint8Array>;

  switch (entity) {
    case "orders": {
      const f = orderFilters(params);
      body = streamCsv(
        // `paidAt` and `incassatoCon` are what let a spreadsheet reproduce the
        // chiusura di cassa: without them the export could say how much was
        // taken but never on what date it settled or through which instrument.
        ["orderNumber", "date", "paidAt", "name", "email", "phone", "status", "paymentStatus", "paymentMethod", "incassatoCon", "fulfilment", "shop", "pickupSlot", "totalEuros", "refundedEuros"],
        (limit, offset) => getOrdersForExport(f, limit, offset),
        (o) => [
          o.orderNumber, iso(o.createdAt), iso(o.paidAt), o.name, o.email, o.phone, o.status,
          o.paymentStatus, o.paymentMethod, o.paidWith ?? "", o.fulfilment, o.shopSlug,
          o.pickupSlotAt ? o.pickupSlotAt.toISOString() : "",
          (o.totalCents / 100).toFixed(2),
          (o.refundedCents / 100).toFixed(2),
        ],
      );
      break;
    }
    case "order-items": {
      // The order-level export answers "how much did we take" and nothing about
      // what was sold. Same filters, one row per line.
      const f = orderFilters(params);
      body = streamCsv(
        [
          "orderNumber", "date", "paidAt", "customer", "status", "paymentStatus", "shop",
          "prodotto", "productId", "quantita", "pesoKg", "prezzoUnitarioEuros",
          "totaleRigaEuros", "ivaPercento",
        ],
        (limit, offset) => getOrderItemsForExport(f, limit, offset),
        (i) => [
          i.orderNumber, iso(i.createdAt), iso(i.paidAt), i.customer, i.status,
          i.paymentStatus, i.shopSlug, i.productName, i.productId,
          i.weightKg != null ? "" : i.quantity,
          i.weightKg ?? "",
          (i.unitPriceCents / 100).toFixed(2),
          (i.lineTotalCents / 100).toFixed(2),
          i.vatRateBps / 100,
        ],
      );
      break;
    }
    case "stock-movements": {
      // The ledger a stocktake is reconciled against.
      body = streamCsv(
        ["timestamp", "prodotto", "sku", "sede", "delta", "giacenzaDopo", "motivo", "operatore"],
        (limit, offset) => getStockMovementsForExport(limit, offset, params.get("prodotto") || undefined),
        (m) => [
          iso(m.createdAt), m.productName, m.sku ?? "", m.shopSlug ?? "",
          m.delta, m.stockAfter, m.reason, m.actor ?? "",
        ],
      );
      break;
    }
    case "batches": {
      // HACCP traceability: which lot, from whom, expiring when.
      body = streamCsv(
        [
          "prodotto", "sku", "lotto", "scadenza", "quantita", "residuo",
          "fornitore", "costoUnitarioEuros", "ricevutoIl", "nota",
        ],
        (limit, offset) => getBatchesForExport(limit, offset),
        (b) => [
          b.productName, b.sku ?? "", b.lotCode, b.expiryDate ?? "", b.quantity, b.remaining,
          b.supplier ?? "",
          b.unitCostCents != null ? (b.unitCostCents / 100).toFixed(2) : "",
          iso(b.receivedAt), b.note ?? "",
        ],
      );
      break;
    }
    case "loyalty": {
      body = streamCsv(
        ["timestamp", "cliente", "username", "tessera", "delta", "saldoDopo", "motivo"],
        (limit, offset) => getLoyaltyForExport(limit, offset),
        (t) => [
          iso(t.createdAt), t.customer, t.username, t.cardNumber ?? "",
          t.delta, t.balanceAfter, t.reason,
        ],
      );
      break;
    }
    case "discount-usage": {
      body = streamCsv(
        ["timestamp", "codice", "ordine", "email", "scontoEuros"],
        (limit, offset) => getDiscountUsageForExport(limit, offset),
        (d) => [
          iso(d.createdAt), d.code, d.orderNumber ?? "", d.email ?? "",
          (d.amountCents / 100).toFixed(2),
        ],
      );
      break;
    }
    case "products": {
      // Round-trips with the importer: the same headers, in the same order, so a
      // price list can be exported, edited in a spreadsheet and pushed back.
      const lowStockThreshold = await getSetting<number>("store.lowStockThreshold", 5);
      const f = productFilters(params);
      body = streamCsv(
        [
          "slug", "nome", "sede", "categoria", "prezzoEuros", "costoEuros", "ivaPercento",
          "unita", "aPeso", "giacenza", "sogliaRiordino", "sku", "fornitore",
          // The importer reads exactly what this writes, so allergens can now
          // make the round trip a bulk edit needs: they were the one field on a
          // food product a spreadsheet could not reach.
          "allergeni",
          "acquistabile", "attivo", "inEvidenza", "ordine",
        ],
        (limit, offset) => getProductsForExport(f, lowStockThreshold, limit, offset),
        (p) => [
          p.slug, p.name, p.shopSlug, p.category,
          p.priceCents != null ? (p.priceCents / 100).toFixed(2) : "",
          p.costCents != null ? (p.costCents / 100).toFixed(2) : "",
          p.vatRateBps / 100,
          p.unit ?? "", p.soldByWeight ? "si" : "no",
          p.stock ?? "", p.reorderPoint ?? "", p.sku ?? "", p.supplier ?? "",
          // Canonical keys, not labels: what goes out is what comes back in.
          p.allergens.join(", "),
          p.purchasable ? "si" : "no", p.active ? "si" : "no", p.featured ? "si" : "no",
          p.sortOrder,
        ],
      );
      break;
    }
    case "customers": {
      const f = customerFilters(params);
      body = streamCsv(
        ["username", "name", "email", "phone", "role", "active", "points", "cardNumber", "joined"],
        (limit, offset) => getCustomersWithPoints(f, limit, offset),
        (c) => [
          c.username, c.name, c.email, c.phone, c.role, c.active ? "si" : "no",
          c.points ?? 0, c.cardNumber, iso(c.createdAt),
        ],
      );
      break;
    }
    case "reservations": {
      const f = reservationFilters(params);
      body = streamCsv(
        ["reference", "date", "type", "name", "phone", "email", "shop", "status", "guests", "quantityKg", "created"],
        (limit, offset) => getReservationsForExport(f, limit, offset),
        (r) => [
          r.reference, r.date, r.type, r.name, r.phone, r.email, r.shopSlug, r.status,
          r.guests, r.quantityKg, iso(r.createdAt),
        ],
      );
      break;
    }
    case "subscribers": {
      const f = subscriberFilters(params);
      body = streamCsv(
        ["email", "status", "source", "confirmedAt", "created"],
        (limit, offset) => getSubscribersForExport(f, limit, offset),
        (s) => [s.email, s.status, s.source, iso(s.confirmedAt), iso(s.createdAt)],
      );
      break;
    }
    case "audit": {
      const f = auditFilters(params);
      body = streamCsv(
        ["timestamp", "actor", "action", "entity", "entityId", "summary", "meta"],
        (limit, offset) => getAuditForExport(f, limit, offset),
        (r) => [
          iso(r.createdAt),
          r.actorName,
          r.action,
          r.entity,
          r.entityId,
          r.summary,
          r.meta ? JSON.stringify(r.meta) : "",
        ],
      );
      break;
    }
    case "email": {
      // Bodies are deliberately left out: they carry password-reset and
      // verification links, and a spreadsheet is not where those belong.
      const f = outboxFilters(params);
      body = streamCsv(
        ["id", "created", "sentAt", "to", "subject", "status", "attempts", "error", "campaignId"],
        (limit, offset) => getOutboxForExport(f, limit, offset),
        (e) => [
          e.id,
          iso(e.createdAt),
          iso(e.sentAt),
          e.toAddress,
          e.subject,
          e.status,
          e.attempts,
          e.error ?? "",
          e.campaignId ?? "",
        ],
      );
      break;
    }
    case "analytics": {
      const range = normalizeRange(params.get("giorni"));
      // Everything the page shows, not just the daily counts: top paths and
      // referrers used to be visible on screen and impossible to take away.
      //
      // The daily series comes from the summary too, rather than being queried
      // again here. The second copy grouped by UTC day while the chart resolves
      // Rome days, so the download and the page it came from could disagree on
      // which day a late-evening visit belonged to — the same rule the IVA
      // export below states outright.
      const summary = await getAnalyticsSummary(new Date(), range);
      body = toCsv(
        ["sezione", "chiave", "valore"],
        [
          ...summary.daily.map((r) => ["Visite giornaliere", r.day, r.n]),
          ...summary.topPaths.map((p) => ["Pagine più viste", p.path, p.n]),
          ...summary.topReferrers.map((r) => ["Provenienza", r.referrer ?? "—", r.n]),
          ["Riepilogo", `Visite ${range} giorni`, summary.views],
          ["Riepilogo", `Ordini ${range} giorni`, summary.orders],
          ["Riepilogo", `Incasso ${range} giorni (€)`, (summary.revenueCents / 100).toFixed(2)],
        ],
      );
      break;
    }
    case "vendite": {
      // The margin report's own three tables, one file, with the section in the
      // first column — a pivot table is what the shop would otherwise build by
      // hand, and this is already grouped for it. Same period and shop resolver
      // as the page, so the download can never disagree with the screen.
      const period = vatPeriod({
        da: params.get("da") ?? undefined,
        a: params.get("a") ?? undefined,
        periodo: params.get("periodo") ?? undefined,
      });
      const negozio = params.get("negozio") ?? undefined;
      const shops = await adminGetShops();
      const shopName = new Map(shops.map((s) => [s.slug, s.name]));
      const { current } = await getSalesAnalysis(
        period.from,
        period.toExclusive,
        negozio && negozio !== "all" ? negozio : undefined,
        null,
        (slug) => (slug ? (shopName.get(slug) ?? slug) : "Spedizioni / senza sede"),
      );
      const row = (section: string, g: SalesGroup) => {
        const pct = marginPct(g);
        return [
          section,
          g.label,
          String(g.units),
          (g.grossCents / 100).toFixed(2),
          (g.netCents / 100).toFixed(2),
          (g.costCents / 100).toFixed(2),
          // Blank rather than 0 when nothing in the row carries a cost: a zero
          // margin and an unknown one are different facts about a product.
          pct == null ? "" : (g.marginCents / 100).toFixed(2),
          pct == null ? "" : String(pct),
          String(g.uncostedLines),
        ];
      };
      body = toCsv(
        [
          "sezione", "voce", "quantita", "incassoEuros", "imponibileEuros",
          "costoEuros", "margineEuros", "marginePct", "righeSenzaCosto",
        ],
        [
          row("Totale", current.totals),
          ...current.byCategory.map((g) => row("Categoria", g)),
          ...current.byShop.map((g) => row("Sede", g)),
          ...current.byProduct.map((g) => row("Prodotto", g)),
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
      body = toCsv(
        ["sezione", "aliquota", "imponibileEuros", "impostaEuros", "totaleIvatoEuros"],
        [
          ...section("Vendite", report.sales),
          ...section("Note di credito", report.reversals),
          ...section("Netto periodo", report.buckets),
        ],
      );
      break;
    }
    case "fatture": {
      // The register is the one fiscal report the commercialista works from and
      // the only one that could not leave the screen. Same period resolver and
      // same status predicate as the page, so the file matches the rows the
      // operator was looking at.
      const period = vatPeriod({
        da: params.get("da") ?? undefined,
        a: params.get("a") ?? undefined,
        periodo: params.get("periodo") ?? undefined,
      });
      const stato = invoiceRegisterStatus(params);
      const rows = (await getInvoiceRegister(period.from, period.toExclusive)).filter((r) =>
        invoiceRegisterMatches(r, stato),
      );
      const shops = await adminGetShops();
      const shopName = new Map(shops.map((s) => [s.slug, s.name]));
      body = toCsv(
        // `nettoEuros` is what the page totals and what the credit notes act on;
        // `totaleEuros` and `rimborsatoEuros` are carried too so a spreadsheet
        // can reconcile the two without re-deriving either.
        ["numero", "cliente", "codiceFiscaleCliente", "sede", "incassata", "totaleEuros", "rimborsatoEuros", "nettoEuros", "fatturaEmessaIl", "notaCreditoIl", "stato"],
        rows.map((r) => [
          r.orderNumber,
          r.name,
          r.hasFiscalIdentity ? "si" : "no",
          r.shopSlug ? shopName.get(r.shopSlug) ?? r.shopSlug : "",
          iso(r.settledAt),
          (r.totalCents / 100).toFixed(2),
          (r.refundedCents / 100).toFixed(2),
          ((r.totalCents - r.refundedCents) / 100).toFixed(2),
          iso(r.invoicedAt),
          iso(r.creditNoteAt),
          r.invoicedAt ? "Fattura emessa" : "Da emettere",
        ]),
      );
      break;
    }
    default:
      return NextResponse.json({ ok: false, error: "Entità non valida" }, { status: 404 });
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="taccalite-${entity}.csv"`,
    },
  });
}
