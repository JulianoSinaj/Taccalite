import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsletterSubscribers } from "@/lib/db/schema";
import { absoluteUrl } from "@/lib/site";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(`newsletter-unsub:${clientIp(request)}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) return NextResponse.redirect(absoluteUrl("/newsletter?stato=errore"));

  const token = new URL(request.url).searchParams.get("token");
  if (token) {
    await db
      .update(newsletterSubscribers)
      .set({ status: "unsubscribed" })
      .where(eq(newsletterSubscribers.token, token));
  }
  return NextResponse.redirect(absoluteUrl("/newsletter?stato=disiscritto"));
}
