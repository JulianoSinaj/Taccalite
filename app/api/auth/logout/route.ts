import { NextResponse } from "next/server";
import { destroySession, getCurrentUser } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/origin";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origine non consentita" }, { status: 403 });
  }
  // Read the user before the session is destroyed, so the audit line can name
  // who left. A logout with no session is a no-op and records nothing.
  const user = await getCurrentUser();
  await destroySession();
  if (user) {
    await logAudit({
      actor: { id: user.id, name: user.name, username: user.username },
      action: "auth.logout",
      entity: "user",
      entityId: user.id,
      summary: `Uscita di ${user.username}`,
    });
  }
  return NextResponse.json({ ok: true });
}
