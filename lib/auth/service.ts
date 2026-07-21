import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPasswordAsync, verifyPasswordAsync, needsRehash, DUMMY_PASSWORD_HASH } from "./password";
import { createSession } from "./session";
import { getOrCreateLoyaltyAccount, addPoints } from "@/lib/loyalty";
import { sendMail } from "@/lib/mail/mailer";
import { welcomeEmail } from "@/lib/mail/templates";
import type { RegisterInput, LoginInput } from "@/lib/validation/auth";

const WELCOME_POINTS = 50;

export type AuthResult = { ok: true; userId: string } | { ok: false; error: string };

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
  if (existing.length) return { ok: false, error: "Questo username è già in uso" };

  const [user] = await db
    .insert(users)
    .values({
      username: input.username,
      email: input.email ?? null,
      name: input.name,
      passwordHash: await hashPasswordAsync(input.password),
      phone: input.phone ?? null,
      role: "customer",
      marketingConsent: input.marketingConsent ?? false,
    })
    .returning({ id: users.id });

  await getOrCreateLoyaltyAccount(user.id);
  await addPoints(user.id, WELCOME_POINTS, "Bonus di benvenuto");
  await createSession(user.id);

  if (input.email) {
    await sendMail({ to: input.email, ...welcomeEmail(input.name, WELCOME_POINTS) }).catch(() => {});
  }

  return { ok: true, userId: user.id };
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const [user] = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
  // Always run a verification (against a dummy hash when the user is missing) so
  // response timing doesn't reveal which usernames exist.
  const ok = await verifyPasswordAsync(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !ok) {
    return { ok: false, error: "Username o password non corretti" };
  }
  // Opportunistically upgrade a hash stored with weaker/older KDF params — this
  // is the only point the plaintext is in hand, so accounts harden silently.
  if (needsRehash(user.passwordHash)) {
    const upgraded = await hashPasswordAsync(input.password);
    await db.update(users).set({ passwordHash: upgraded }).where(eq(users.id, user.id));
  }
  await createSession(user.id);
  return { ok: true, userId: user.id };
}
