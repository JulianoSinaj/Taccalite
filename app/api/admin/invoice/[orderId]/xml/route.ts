import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { adminGetOrder } from "@/lib/admin/queries";
import { getSetting } from "@/lib/db/queries";
import {
  buildFatturaXml,
  buildNotaCreditoXml,
  creditNoteNumber,
  type FiscalIdentity,
} from "@/lib/fattura";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Generate a FatturaPA (FPR12) XML for an order. Admin-only.
 *
 * `?doc=nota-credito` returns the TD04 credit note for the refunded portion
 * instead of the TD01 invoice — the counter-document a refunded sale needs so
 * the original invoice isn't left declaring VAT on money that was given back.
 */
export async function GET(request: Request, ctx: { params: Promise<{ orderId: string }> }) {
  let actor;
  try {
    actor = await requireRole("admin");
  } catch {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
  }

  const { orderId } = await ctx.params;
  const creditNote = new URL(request.url).searchParams.get("doc") === "nota-credito";
  const data = await adminGetOrder(orderId);
  if (!data) return NextResponse.json({ ok: false, error: "Ordine non trovato" }, { status: 404 });

  if (creditNote && data.order.refundedCents <= 0) {
    return NextResponse.json(
      { ok: false, error: "Nessun rimborso registrato su questo ordine: non c'è nota di credito da emettere." },
      { status: 400 },
    );
  }

  const [legalName, vatNumber, taxCode, address, zip, city, province, regime, rea, shippingVatPct] =
    await Promise.all([
      getSetting<string>("business.legalName", "Norcineria Taccalite"),
      getSetting<string>("business.vatNumber", ""),
      getSetting<string>("business.taxCode", ""),
      getSetting<string>("business.address", ""),
      getSetting<string>("business.zip", ""),
      getSetting<string>("business.city", ""),
      getSetting<string>("business.province", ""),
      getSetting<string>("business.regime", "Ordinario"),
      // Collected in Impostazioni since the fiscal-identity work and read by
      // nothing until now — not even here, the one document with a slot for it.
      getSetting<string>("business.rea", ""),
      getSetting<number>("store.shippingVatRate", 22),
    ]);

  if (!vatNumber) {
    return NextResponse.json(
      { ok: false, error: "Partita IVA non configurata. Impostala in Impostazioni prima di generare la fattura." },
      { status: 400 },
    );
  }

  const fiscal: FiscalIdentity = {
    legalName,
    vatNumber,
    taxCode,
    address,
    zip,
    city,
    province,
    regime,
    rea,
  };
  const shippingVatBps = Math.round(shippingVatPct * 100);
  const base = data.order.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "00001";
  // A credit note is a distinct document and must not reuse the invoice's
  // ProgressivoInvio.
  const progressivo = creditNote ? `NC${base}`.slice(0, 10) : base;
  const xml = creditNote
    ? buildNotaCreditoXml(data.order, data.items, fiscal, progressivo, shippingVatBps)
    : buildFatturaXml(data.order, data.items, fiscal, progressivo, shippingVatBps);

  const number = creditNote ? creditNoteNumber(data.order.orderNumber) : data.order.orderNumber;

  await logAudit({
    actor,
    action: creditNote ? "invoice.credit_note_xml" : "invoice.xml",
    entity: "order",
    entityId: data.order.id,
    summary: creditNote
      ? `Nota di credito ${number} generata per l'ordine ${data.order.orderNumber} (${(
          data.order.refundedCents / 100
        ).toFixed(2)} €)`
      : `Fattura XML generata per l'ordine ${data.order.orderNumber}`,
    meta: creditNote ? { refundedCents: data.order.refundedCents } : undefined,
  });

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${creditNote ? "nota-credito" : "fattura"}-${
        data.order.orderNumber
      }.xml"`,
    },
  });
}
