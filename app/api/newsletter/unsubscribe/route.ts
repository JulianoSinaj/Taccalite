import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsletterSubscribers } from "@/lib/db/schema";
import { absoluteUrl } from "@/lib/site";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (token) {
    await db
      .update(newsletterSubscribers)
      .set({ status: "unsubscribed" })
      .where(eq(newsletterSubscribers.token, token));
  }
  return NextResponse.redirect(absoluteUrl("/newsletter?stato=disiscritto"));
}
