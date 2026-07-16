import { NextResponse } from "next/server";
import { z } from "zod";
import { subscribeNewsletter } from "@/lib/newsletter";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida"),
  company: z.string().optional(), // honeypot
});

export async function POST(request: Request) {
  const limited = rateLimit(`newsletter:${clientIp(request)}`, { limit: 5, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Troppe richieste. Riprova tra poco." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Email non valida" }, { status: 400 });
  }
  if (parsed.data.company) return NextResponse.json({ ok: true }); // honeypot

  const result = await subscribeNewsletter(parsed.data.email);
  if (!result.ok) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({
    ok: true,
    message: result.already
      ? "Sei già iscritto. Grazie!"
      : "Controlla la tua email per confermare l'iscrizione.",
  });
}
