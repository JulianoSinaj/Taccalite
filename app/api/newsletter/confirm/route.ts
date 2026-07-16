import { NextResponse } from "next/server";
import { confirmNewsletter } from "@/lib/newsletter";
import { absoluteUrl } from "@/lib/site";

export const runtime = "nodejs";

/** Double opt-in landing — redirects to a friendly status page. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(absoluteUrl("/newsletter?stato=errore"));

  const ok = await confirmNewsletter(token);
  return NextResponse.redirect(absoluteUrl(`/newsletter?stato=${ok ? "confermato" : "errore"}`));
}
