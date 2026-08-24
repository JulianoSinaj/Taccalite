import { NextResponse } from "next/server";
import { quickSearch } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { shopScope } from "@/lib/admin/scope";

export const runtime = "nodejs";

/**
 * Records for the ⌘K palette.
 *
 * Staff-accessible, like the customer picker next door: these are the same
 * records their own lists already show them, and the term is mandatory so the
 * endpoint can't be walked to enumerate the database. A staff account assigned
 * to a location gets its location, since `quickSearch` applies the same scope
 * their lists are locked to — the palette must not be the way around it.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "Non autorizzato" }, { status: 403 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, hits: [] });

  const hits = await quickSearch(q, { scope: await shopScope() });
  return NextResponse.json({ ok: true, hits });
}
