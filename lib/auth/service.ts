import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "./password";
import { createSession } from "./session";
import { getOrCreateLoyaltyAccount, addPoints } from "@/lib/loyalty";
import { sendMail } from "@/lib/mail/mailer";
import { welcomeEmail } from "@/lib/mail/templates";
import type { RegisterInput, LoginInput } from "@/lib/validation/auth";

const WELCOME_POINTS = 50;

export type AuthResult = { ok: true; userId: string } | { ok: false; error: string };

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing.length) return { ok: false, error: "Esiste già un account con questa email" };

  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      name: input.name,
      passwordHash: hashPassword(input.password),
      phone: input.phone ?? null,
      role: "customer",
      marketingConsent: input.marketingConsent ?? false,
    })
    .returning({ id: users.id });

  await getOrCreateLoyaltyAccount(user.id);
  await addPoints(user.id, WELCOME_POINTS, "Bonus di benvenuto");
  await createSession(user.id);

  await sendMail({ to: input.email, ...welcomeEmail(input.name, WELCOME_POINTS) }).catch(() => {});

  return { ok: true, userId: user.id };
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    return { ok: false, error: "Email o password non corretti" };
  }
  await createSession(user.id);
  return { ok: true, userId: user.id };
}
