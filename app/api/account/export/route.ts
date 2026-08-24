import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { gatherUserData } from "@/lib/gdpr";
import { logAudit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * GDPR right-of-access (art. 15), self-service.
 *
 * The same `gatherUserData` the admin export uses, scoped to the caller's own
 * session — there is no id parameter to tamper with, which is what makes this
 * safe to expose without the admin guard. Making the customer ask an operator
 * for their own data satisfied the law and nothing else.
 */
export async function GET(request: Request) {
  const limited = rateLimit(`gdpr-self:${clientIp(request)}`, { limit: 5, windowMs: 60 * 60_000 });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Troppe richieste." }, { status: 429 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 401 });

  const data = await gatherUserData(user.id);
  if (!data) return NextResponse.json({ ok: false, error: "Dati non trovati" }, { status: 404 });

  await logAudit({
    actor: { id: user.id, name: user.name, username: user.username },
    action: "gdpr.export_self",
    entity: "user",
    entityId: user.id,
    summary: `${user.username} ha scaricato i propri dati`,
  });

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="i-miei-dati-taccalite.json"`,
      "Cache-Control": "no-store",
    },
  });
}
