import "server-only";
import { eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, users, type UserRow } from "@/lib/db/schema";
import {
  hashPasswordAsync,
  verifyPasswordAsync,
  needsRehash,
  DUMMY_PASSWORD_HASH,
} from "./password";
import { createSession, deleteUserSessions, deleteOtherUserSessions } from "./session";
import { consumeToken, issueToken, revokeTokens } from "./tokens";
import { attachOrderToUser, claimGuestOrders, countClaimableOrders } from "./claim";
import { getOrCreateLoyaltyAccount, addPoints } from "@/lib/loyalty";
import { sendMail } from "@/lib/mail/mailer";
import {
  welcomeEmail,
  passwordResetEmail,
  passwordChangedEmail,
  verifyEmailEmail,
} from "@/lib/mail/templates";
import { verifyTotp } from "@/lib/auth/totp";
import { consumeRecoveryCode } from "@/lib/auth/recovery-codes";
import { subscribeNewsletter } from "@/lib/newsletter";
import { absoluteUrl } from "@/lib/site";
import { logAudit, type Actor } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import type {
  RegisterInput,
  LoginInput,
  PasswordResetInput,
  PasswordChangeInput,
} from "@/lib/validation/auth";

const WELCOME_POINTS = 50;

/**
 * Failed attempts tolerated before an account locks, and for how long.
 *
 * This exists because the per-IP limiter in `lib/rate-limit.ts` cannot see the
 * attack that matters: a few attempts per hour against one known account from a
 * thousand different addresses never trips a per-IP bucket.
 *
 * The tradeoff is that anyone who knows an address can lock its owner out for
 * fifteen minutes. That is why the window is short and why a successful password
 * reset clears the lock outright — the owner always has a way through that does
 * not depend on waiting.
 */
const LOCK_THRESHOLD = 10;
const LOCK_MS = 1000 * 60 * 15;

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; twoFactorRequired?: boolean };

function actorOf(user: Pick<UserRow, "id" | "name" | "username">): Actor {
  return { id: user.id, name: user.name, username: user.username };
}

/**
 * Build the `username` for an account created from an email address.
 *
 * The column is NOT NULL UNIQUE and cannot be dropped without rebuilding a table
 * that carries an FTS5 index, so it stays — but nobody is asked to invent one
 * any more. The local part is slugified into the legacy charset
 * (`[a-z0-9._-]`), padded when it is too short, and suffixed on collision.
 */
export async function deriveUsername(email: string): Promise<string> {
  const local = email.split("@")[0] ?? "";
  // `slugify` collapses to hyphens, which the legacy charset allows; dots and
  // underscores in the original survive as hyphens rather than being dropped.
  let base = slugify(local).slice(0, 32);
  if (base.length < 3) base = `cliente-${base}`.slice(0, 32).replace(/-$/, "");
  if (base.length < 3) base = "cliente";

  const taken = async (candidate: string) => {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);
    return !!row;
  };

  if (!(await taken(base))) return base;
  for (let n = 2; n <= 50; n++) {
    const candidate = `${base}${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  // Pathological collision; fall back to something that cannot collide.
  return `${base}-${Date.now().toString(36)}`.slice(0, 40);
}

/** Look up an account by email (identifier containing "@") or legacy username. */
async function findByIdentifier(identifier: string) {
  const id = identifier.trim().toLowerCase();
  if (!id) return undefined;
  const [user] = id.includes("@")
    ? await db.select().from(users).where(eq(sql`lower(${users.email})`, id)).limit(1)
    : await db.select().from(users).where(eq(users.username, id)).limit(1);
  return user;
}

/** Send (or re-send) the address-verification link for an account. */
export async function sendVerificationEmail(
  user: Pick<UserRow, "id" | "name" | "username">,
  email: string,
): Promise<void> {
  const { token } = await issueToken(user.id, "email_verify", email);
  const url = absoluteUrl(`/api/auth/email/verify?token=${token}`);
  const claimable = await countClaimableOrders(email);
  await sendMail({
    to: email,
    ...verifyEmailEmail(url, user.name || user.username || "", claimable),
  }).catch(() => {});
}

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  // Both uniqueness checks up front. `users.email` is UNIQUE, so without this
  // the insert threw a raw SQLite constraint error straight out of an uncaught
  // route handler — a 500 where the customer needed "quell'indirizzo è già
  // registrato, prova ad accedere".
  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, input.email))
    .limit(1);
  if (existingEmail) {
    return {
      ok: false,
      error: "Esiste già un account con questa email. Prova ad accedere o a reimpostare la password.",
    };
  }

  const username = input.username ?? (await deriveUsername(input.email));
  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (clash) return { ok: false, error: "Questo username è già in uso" };

  const [user] = await db
    .insert(users)
    .values({
      username,
      email: input.email,
      name: input.name,
      passwordHash: await hashPasswordAsync(input.password),
      phone: input.phone ?? null,
      role: "customer",
      marketingConsent: input.marketingConsent ?? false,
    })
    .returning({ id: users.id, name: users.name, username: users.username });

  await getOrCreateLoyaltyAccount(user.id);
  await addPoints(user.id, WELCOME_POINTS, "Bonus di benvenuto");
  await createSession(user.id);

  await sendMail({ to: input.email, ...welcomeEmail(input.name, WELCOME_POINTS) }).catch(() => {});
  await sendVerificationEmail(user, input.email);

  // The consent checkbox used to set a column nothing read: campaigns go to
  // confirmed `newsletter_subscribers`, so a customer who asked for news never
  // got any while the shop believed it had consent. Route it into the same
  // double opt-in the footer form uses — the address still has to confirm.
  if (input.marketingConsent) {
    await subscribeNewsletter(input.email, "registrazione").catch(() => {});
  }

  await logAudit({
    actor: actorOf(user),
    action: "account.register",
    entity: "user",
    entityId: user.id,
    summary: `Nuovo account cliente ${username} (${input.email})`,
  });

  return { ok: true, userId: user.id };
}

/**
 * Create an account straight from a completed guest order.
 *
 * The confirmation page is the one moment a guest is holding proof that a
 * particular order is theirs, has already typed their name, address and phone,
 * and can see exactly how many points the purchase would have earned. Asking for
 * a password there converts far better than asking them to fill the same form
 * again later from a cold start.
 *
 * The account starts **unverified** even though the caller proved they placed
 * this order: the order token says nothing about who controls the mailbox. So
 * this order is attached immediately (the token does prove that much) while
 * every *other* order on the address waits for the verification link.
 */
export async function registerFromOrder(input: {
  orderId: string;
  name: string;
  email: string;
  phone?: string | null;
  password: string;
}): Promise<{ ok: true; userId: string; points: number } | { ok: false; error: string }> {
  const address = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, address))
    .limit(1);
  if (existing) {
    return { ok: false, error: "Esiste già un account con questa email." };
  }

  const username = await deriveUsername(address);
  const [user] = await db
    .insert(users)
    .values({
      username,
      email: address,
      name: input.name,
      passwordHash: await hashPasswordAsync(input.password),
      phone: input.phone ?? null,
      role: "customer",
    })
    .returning({ id: users.id, name: users.name, username: users.username });

  await getOrCreateLoyaltyAccount(user.id);
  await addPoints(user.id, WELCOME_POINTS, "Bonus di benvenuto");
  await createSession(user.id);

  const { points } = await attachOrderToUser(input.orderId, user.id);

  await sendMail({ to: address, ...welcomeEmail(input.name, WELCOME_POINTS) }).catch(() => {});
  await sendVerificationEmail(user, address);

  await logAudit({
    actor: actorOf(user),
    action: "account.register",
    entity: "user",
    entityId: user.id,
    summary: `Nuovo account cliente ${username} creato dalla conferma d'ordine (${address})`,
  });

  return { ok: true, userId: user.id, points };
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const user = await findByIdentifier(input.identifier);

  // Always run a verification (against a dummy hash when the user is missing) so
  // response timing doesn't reveal which identifiers exist.
  const ok = await verifyPasswordAsync(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user) {
    return { ok: false, error: "Credenziali non corrette" };
  }

  // Checked before the password verdict is acted on, so a locked account gives
  // the same answer whether or not the guess was right.
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    return {
      ok: false,
      error: `Troppi tentativi falliti. Riprova tra ${mins} minuti o reimposta la password.`,
    };
  }

  if (!ok) {
    await registerFailedAttempt(user, "password");
    return { ok: false, error: "Credenziali non corrette" };
  }
  if (!user.active) {
    return { ok: false, error: "Questo account è stato disattivato." };
  }

  // Two-factor: when enabled, a valid TOTP code is required before a session is
  // issued. Password is already verified here, so a wrong/missing code prompts the
  // second step without revealing anything new.
  if (user.totpEnabled && user.totpSecret) {
    if (!input.code) {
      return { ok: false, error: "Inserisci il codice di verifica.", twoFactorRequired: true };
    }
    if (!verifyTotp(user.totpSecret, input.code)) {
      // Fall back to a single-use recovery code, so a lost authenticator isn't a
      // lockout. A spent code is marked immediately, before the session is
      // issued, so the same code can never be replayed.
      const remaining = consumeRecoveryCode(user.totpRecoveryCodes, input.code);
      if (!remaining) {
        await registerFailedAttempt(user, "2fa");
        return { ok: false, error: "Codice di verifica non valido.", twoFactorRequired: true };
      }
      await db.update(users).set({ totpRecoveryCodes: remaining }).where(eq(users.id, user.id));
    }
  }

  // Opportunistically upgrade a hash stored with weaker/older KDF params — this
  // is the only point the plaintext is in hand, so accounts harden silently.
  if (needsRehash(user.passwordHash)) {
    const upgraded = await hashPasswordAsync(input.password);
    await db.update(users).set({ passwordHash: upgraded }).where(eq(users.id, user.id));
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, user.id));
  await createSession(user.id);

  // Back-office sign-ins only. The activity log exists to answer "who did which
  // sensitive back-office action", and a row per *customer* login buried that
  // under routine traffic — kept for two years, and the single biggest category
  // in the log on any site with real customers. Failed attempts and lockouts are
  // still recorded for everyone (see `registerFailedAttempt`): those are rare and
  // are exactly the security signal this log should carry.
  if (user.role === "admin" || user.role === "staff") {
    await logAudit({
      actor: actorOf(user),
      action: "auth.login",
      entity: "user",
      entityId: user.id,
      summary: `Accesso di ${user.username} (${user.role})`,
    });
  }

  return { ok: true, userId: user.id };
}

/** Count a failed attempt and lock the account once it crosses the threshold. */
async function registerFailedAttempt(
  user: Pick<UserRow, "id" | "name" | "username" | "failedLoginCount">,
  kind: "password" | "2fa",
): Promise<void> {
  const count = (user.failedLoginCount ?? 0) + 1;
  const locked = count >= LOCK_THRESHOLD;
  await db
    .update(users)
    .set({
      failedLoginCount: count,
      ...(locked ? { lockedUntil: new Date(Date.now() + LOCK_MS) } : {}),
    })
    .where(eq(users.id, user.id));

  await logAudit({
    actor: actorOf(user),
    action: kind === "2fa" ? "auth.2fa_failed" : "auth.login_failed",
    entity: "user",
    entityId: user.id,
    summary: locked
      ? `Account ${user.username} bloccato dopo ${count} tentativi falliti`
      : `Tentativo di accesso fallito per ${user.username} (${count})`,
    meta: { count, locked },
  });
}

/**
 * Start a password reset.
 *
 * Always resolves the same way, and does the same rough amount of work, whether
 * or not the address is registered — the response must not be an oracle for
 * which of the shop's customers have accounts. The caller renders one fixed
 * message regardless.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const address = email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, address))
    .limit(1);

  if (!user || !user.active) return;

  const { token, expiresAt } = await issueToken(user.id, "password_reset", address);
  const url = absoluteUrl(`/password/reimposta?token=${token}`);
  const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
  await sendMail({ to: address, ...passwordResetEmail(url, minutes) }).catch(() => {});

  await logAudit({
    actor: actorOf(user),
    action: "auth.password_reset_requested",
    entity: "user",
    entityId: user.id,
    summary: `Richiesta di reimpostazione password per ${user.username}`,
  });
}

export type ResetResult = { ok: true } | { ok: false; error: string };

/** Redeem a reset link and set the new password. */
export async function resetPassword(input: PasswordResetInput): Promise<ResetResult> {
  const claimed = await consumeToken(input.token, "password_reset");
  if (!claimed) {
    return { ok: false, error: "Link non valido o scaduto. Richiedine uno nuovo." };
  }

  const [user] = await db.select().from(users).where(eq(users.id, claimed.userId)).limit(1);
  if (!user || !user.active) {
    return { ok: false, error: "Questo account non è disponibile." };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPasswordAsync(input.password),
      // Getting back in through the mailbox clears the lockout: the whole point
      // of the short lock window is that the owner is never stuck behind it.
      failedLoginCount: 0,
      lockedUntil: null,
      // Redeeming a link proves the address, so an account that reset its
      // password has necessarily verified its email.
      ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
    })
    .where(eq(users.id, user.id));

  // A password reset must log the user out everywhere, and must not leave a
  // second reset link live.
  await deleteUserSessions(user.id);
  await revokeTokens(user.id, "password_reset");
  await notifyPasswordChanged(user);

  await logAudit({
    actor: actorOf(user),
    action: "auth.password_changed",
    entity: "user",
    entityId: user.id,
    summary: `Password reimpostata da ${user.username} tramite link email`,
  });

  // First-time verification here also earns the account its past guest orders.
  if (!user.emailVerifiedAt && user.email) {
    await claimGuestOrders(user.id, user.email).catch(() => {});
  }

  return { ok: true };
}

/** Change a password from inside the account area (current password required). */
export async function changePassword(
  userId: string,
  input: PasswordChangeInput,
): Promise<ResetResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { ok: false, error: "Account non trovato." };

  const ok = await verifyPasswordAsync(input.currentPassword, user.passwordHash);
  if (!ok) return { ok: false, error: "La password attuale non è corretta." };

  await db
    .update(users)
    .set({ passwordHash: await hashPasswordAsync(input.password) })
    .where(eq(users.id, userId));

  // Keep *this* device signed in — a password change is routine hygiene, and
  // logging the user out of the page they just used reads as a failure. Every
  // other session dies, which is the part that matters.
  await deleteOtherUserSessions(userId);
  await revokeTokens(userId, "password_reset");
  await notifyPasswordChanged(user);

  await logAudit({
    actor: actorOf(user),
    action: "auth.password_changed",
    entity: "user",
    entityId: userId,
    summary: `Password cambiata da ${user.username} dall'area personale`,
  });

  return { ok: true };
}

/**
 * Tell the account holder their password moved, whoever moved it.
 *
 * The number comes from the shop record rather than a constant: this email asks
 * someone who may have just been compromised to phone the bottega, so it has to
 * carry a number that is actually answered.
 */
export async function notifyPasswordChanged(
  user: Pick<UserRow, "name" | "username" | "email">,
): Promise<void> {
  if (!user.email) return;
  const [shop] = await db
    .select({ phone: shops.phone })
    .from(shops)
    .where(ne(shops.phone, ""))
    .orderBy(shops.sortOrder)
    .limit(1);
  await sendMail({
    to: user.email,
    ...passwordChangedEmail(user.name || user.username || "", { phone: shop?.phone ?? null }),
  }).catch(() => {});
}

export type VerifyResult =
  | { ok: true; claimed: { orders: number; points: number } }
  | { ok: false; error: string };

/** Redeem an email-verification link. */
export async function verifyEmailToken(token: string): Promise<VerifyResult> {
  const claimed = await consumeToken(token, "email_verify");
  if (!claimed) return { ok: false, error: "Link non valido o scaduto." };

  const [user] = await db.select().from(users).where(eq(users.id, claimed.userId)).limit(1);
  if (!user) return { ok: false, error: "Account non trovato." };

  // The address on the token wins over the one on the row: this is how an email
  // *change* lands, having proven the new address before it is written.
  const address = (claimed.email ?? user.email ?? "").trim().toLowerCase();
  if (!address) return { ok: false, error: "Nessun indirizzo da confermare." };

  // Another account may have taken the address in the meantime.
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, address))
    .limit(1);
  if (taken && taken.id !== user.id) {
    return { ok: false, error: "Questo indirizzo è ora associato a un altro account." };
  }

  await db
    .update(users)
    .set({ email: address, emailVerifiedAt: new Date() })
    .where(eq(users.id, user.id));

  await logAudit({
    actor: actorOf(user),
    action: "account.email_verified",
    entity: "user",
    entityId: user.id,
    summary: `Indirizzo ${address} confermato da ${user.username}`,
  });

  const result = await claimGuestOrders(user.id, address).catch(() => ({ orders: 0, points: 0 }));
  return { ok: true, claimed: result };
}

/**
 * Re-send a verification link. Silent about whether the address exists or is
 * already verified, for the same reason `requestPasswordReset` is.
 */
export async function resendVerification(email: string): Promise<void> {
  const address = email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, address))
    .limit(1);
  if (!user || !user.active || user.emailVerifiedAt) return;
  await sendVerificationEmail(user, address);
}
