import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for the container healthcheck and reverse proxy.
 * Runs a trivial query so "healthy" means the process is up AND the SQLite
 * database is reachable. Returns 200 when OK, 503 otherwise. Intentionally
 * leaks no internal detail (no versions, paths, or error text).
 */
export async function GET() {
  try {
    db.get(sql`select 1`);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
