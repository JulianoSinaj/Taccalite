import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origine non consentita" }, { status: 403 });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
