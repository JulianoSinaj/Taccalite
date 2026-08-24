import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getLoyaltySummary } from "@/lib/loyalty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who is signed in, for the header badge.
 *
 * A route handler rather than a prop threaded down from the layout, and that is
 * the whole point: `app/(site)/layout.tsx` renders every storefront page, so
 * reading the session there would make the entire site dynamic to put a name in
 * the corner. The header stays a static shell and fetches this one small thing.
 *
 * `no-store` because a cached answer here would show one customer's name to the
 * next visitor served from the same edge cache.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ signedIn: false }, { headers: { "Cache-Control": "no-store" } });
  }

  let points = 0;
  try {
    const summary = await getLoyaltySummary(user.id);
    points = summary.account.points;
  } catch {
    // A missing loyalty row must not blank the header.
  }

  return NextResponse.json(
    {
      signedIn: true,
      name: user.name || user.username,
      points,
      // Drives the "conferma la tua email" nudge; the badge is the one thing a
      // signed-in customer sees on every page, so it is where the nudge belongs.
      hasEmail: !!user.email,
      emailVerified: !!user.emailVerifiedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
