import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { adminGetOrder } from "@/lib/admin/queries";
import { getSetting } from "@/lib/db/queries";
import { buildFatturaXml, type FiscalIdentity } from "@/lib/fattura";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

/** Generate a FatturaPA (FPR12) XML for an order. Admin-only. */
export async function GET(_request: Request, ctx: { params: Promise<{ orderId: string }> }) {
  let actor;
  try {
    actor = await requireRole("admin");
  } catch {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
  }

  const { orderId } = await ctx.params;
  const data = await adminGetOrder(orderId);
  if (!data) return NextResponse.json({ ok: false, error: "Ordine non trovato" }, { status: 404 });

  const [legalName, vatNumber, taxCode, address, zip, city, province, regime] = await Promise.all([
    getSetting<string>("business.legalName", "Norcineria Taccalite"),
    getSetting<string>("business.vatNumber", ""),
    getSetting<string>("business.taxCode", ""),
    getSetting<string>("business.address", ""),
    getSetting<string>("business.zip", ""),
    getSetting<string>("business.city", ""),
    getSetting<string>("business.province", ""),
    getSetting<string>("business.regime", "Ordinario"),
  ]);

  if (!vatNumber) {
    return NextResponse.json(
      { ok: false, error: "Partita IVA non configurata. Impostala in Impostazioni prima di generare la fattura." },
      { status: 400 },
    );
  }

  const fiscal: FiscalIdentity = { legalName, vatNumber, taxCode, address, zip, city, province, regime };
  const progressivo = data.order.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "00001";
  const xml = buildFatturaXml(data.order, data.items, fiscal, progressivo);

  await logAudit({
    actor,
    action: "invoice.xml",
    entity: "order",
    entityId: data.order.id,
    summary: `Fattura XML generata per l'ordine ${data.order.orderNumber}`,
  });

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="fattura-${data.order.orderNumber}.xml"`,
    },
  });
}
