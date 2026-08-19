import { NextResponse } from "next/server";
import { z } from "zod";
import { sendMail } from "@/lib/mail/mailer";
import { contactOwnerEmail } from "@/lib/mail/templates";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/origin";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

export const TOPICS = [
  "Informazioni",
  "Catering",
  "Consegna a domicilio",
  "Richiesta speciale",
] as const;

const schema = z.object({
  name: z.string().trim().min(2, "Nome troppo corto").max(80),
  email: z.string().trim().toLowerCase().email("Email non valida"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  topic: z.enum(TOPICS),
  message: z.string().trim().min(10, "Scrivi qualche parola in più").max(2000),
  company: z.string().optional(), // honeypot
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origine non consentita" }, { status: 403 });
  }

  const limited = rateLimit(`contatti:${clientIp(request)}`, { limit: 4, windowMs: 300_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Troppi messaggi. Riprova tra qualche minuto." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Richiesta non valida" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Controlla i campi" },
      { status: 400 }
    );
  }
  // Bots fill every field they find; a human never sees this one.
  if (parsed.data.company) return NextResponse.json({ ok: true });

  const { name, email, phone, topic, message } = parsed.data;
  const built = contactOwnerEmail({ name, email, phone: phone || null, topic, message });

  // `sendMail` writes to the outbox first, so a message survives even with no
  // SMTP configured — the owner finds it in the gestionale either way.
  await sendMail({ to: siteConfig.email, ...built });

  return NextResponse.json({
    ok: true,
    message: "Messaggio inviato. Vi rispondiamo al più presto.",
  });
}
