import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { gatherUserData } from "@/lib/gdpr";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

/** GDPR right-of-access export: full JSON dump of a customer's data (admin-only). */
export async function GET(_request: Request, ctx: { params: Promise<{ userId: string }> }) {
  let actor;
  try {
    actor = await requireRole("admin");
  } catch {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
  }

  const { userId } = await ctx.params;
  const data = await gatherUserData(userId);
  if (!data) return NextResponse.json({ ok: false, error: "Utente non trovato" }, { status: 404 });

  await logAudit({
    actor,
    action: "gdpr.export",
    entity: "user",
    entityId: userId,
    summary: `Esportazione dati GDPR per ${data.user.username}`,
  });

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="gdpr-${data.user.username}.json"`,
    },
  });
}
