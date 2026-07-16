import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation/auth";
import { registerUser } from "@/lib/auth/service";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(`register:${clientIp(request)}`, { limit: 5, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json({ ok: false, error: "Troppe richieste. Riprova tra poco." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ ok: false, error: first?.message ?? "Dati non validi" }, { status: 400 });
  }

  const result = await registerUser(parsed.data);
  if (!result.ok) return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ ok: true });
}
