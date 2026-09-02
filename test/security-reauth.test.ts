import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  startEnrolment,
  confirmEnrolment,
  regenerateCodes,
  disableEnrolment,
} from "@/lib/auth/enrolment";
import { totpToken } from "@/lib/auth/totp";

/**
 * Weakening the second factor requires the first one.
 *
 * Turning 2FA off and minting a fresh batch of recovery codes were both
 * protected by nothing but holding a live session — which is precisely the
 * thing a second factor exists to survive. Somebody at an unlocked gestionale,
 * or riding a stolen session cookie, could strip the account back to one factor
 * and mint themselves a way back in on the way past.
 */

const PASSWORD = "Password!234";
const WRONG = "Password!235";
const USERNAME = "reauth-user";
let actor = { id: "", name: "Reauth" };

async function row() {
  const [u] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  return u!;
}

/** Get the account to a fully enrolled state. */
async function enrol() {
  await startEnrolment(actor);
  const secret = (await row()).totpSecret!;
  const res = await confirmEnrolment(actor, totpToken(secret));
  expect(res.ok).toBe(true);
  return res;
}

beforeAll(async () => {
  await db
    .insert(users)
    .values({
      username: USERNAME,
      email: "reauth@example.com",
      name: "Reauth",
      passwordHash: hashPassword(PASSWORD),
      role: "admin",
    })
    .onConflictDoNothing({ target: users.username });
  const [u] = await db.select().from(users).where(eq(users.username, USERNAME)).limit(1);
  actor = { id: u!.id, name: u!.name };
});

beforeEach(async () => {
  await db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null, totpRecoveryCodes: null })
    .where(eq(users.id, actor.id));
});

describe("disabling two-factor", () => {
  it("refuses without the account password", async () => {
    await enrol();

    const res = await disableEnrolment(actor, "");
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/password/i);
    // Still armed.
    expect((await row()).totpEnabled).toBe(true);
    expect((await row()).totpSecret).toBeTruthy();
  });

  it("refuses the wrong password", async () => {
    await enrol();

    const res = await disableEnrolment(actor, WRONG);
    expect(res.ok).toBe(false);
    expect((await row()).totpEnabled).toBe(true);
  });

  it("turns the factor off — and takes the recovery codes with it — on the right password", async () => {
    await enrol();

    const res = await disableEnrolment(actor, PASSWORD);
    expect(res.ok).toBe(true);

    const after = await row();
    expect(after.totpEnabled).toBe(false);
    // The codes only ever protected this one factor.
    expect(after.totpSecret).toBeNull();
    expect(after.totpRecoveryCodes).toBeNull();
  });
});

describe("regenerating recovery codes", () => {
  it("refuses the wrong password and leaves the existing batch working", async () => {
    const enrolled = await enrol();
    const before = (await row()).totpRecoveryCodes;

    const res = await regenerateCodes(actor, WRONG);
    expect(res.ok).toBe(false);
    expect((await row()).totpRecoveryCodes).toEqual(before);
    // The batch handed out at enrolment is untouched.
    expect((enrolled as { codes?: string[] }).codes?.length).toBeGreaterThan(0);
  });

  it("issues a new batch on the right password", async () => {
    await enrol();
    const before = (await row()).totpRecoveryCodes;

    const res = await regenerateCodes(actor, PASSWORD);
    expect(res.ok).toBe(true);
    expect((res as { codes?: string[] }).codes?.length).toBeGreaterThan(0);
    expect((await row()).totpRecoveryCodes).not.toEqual(before);
  });

  it("still refuses before the factor is enrolled at all, password or not", async () => {
    const res = await regenerateCodes(actor, PASSWORD);
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/Attiva prima/);
  });
});
