import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Single-use recovery codes for two-factor authentication.
 *
 * Without these, a lost authenticator app is a permanent lockout — the only way
 * back in was direct database access. A code is shown to the user exactly once
 * at generation; only its hash is stored.
 *
 * The hash is a plain SHA-256, not the password KDF: these are 50-bit random
 * strings drawn from an unambiguous alphabet, so there is nothing to brute-force
 * offline, and a slow KDF would mean re-hashing up to ten codes on every failed
 * login attempt.
 */

export type StoredRecoveryCode = { hash: string; usedAt: number | null };

/** No 0/O/1/I/L — these get transcribed by hand off a printout. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUP = 5;
const GROUPS = 2; // 10 chars ≈ 49 bits
export const RECOVERY_CODE_COUNT = 10;

/** Generate a fresh batch of plaintext codes, e.g. "A7K2M-9PQXT". */
export function generateRecoveryCodes(n = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: n }, () =>
    Array.from({ length: GROUPS }, () =>
      Array.from({ length: GROUP }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""),
    ).join("-"),
  );
}

/** Uppercase and strip anything that isn't part of the alphabet, so a code
 *  typed with lowercase letters, spaces or missing dashes still matches. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

export function toStored(codes: string[]): StoredRecoveryCode[] {
  return codes.map((c) => ({ hash: hashRecoveryCode(c), usedAt: null }));
}

/** Constant-time hex comparison, so matching can't be timed. */
function hashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Try to spend a recovery code.
 *
 * Returns the updated array when the code matched an unused entry (the caller
 * persists it), or null when it didn't match. Every stored code is compared even
 * after a hit, so the work done doesn't depend on which code was supplied.
 */
export function consumeRecoveryCode(
  stored: StoredRecoveryCode[] | null | undefined,
  input: string,
  now = Date.now(),
): StoredRecoveryCode[] | null {
  if (!stored || stored.length === 0) return null;
  const candidate = hashRecoveryCode(input);
  if (candidate.length !== 64) return null;

  let matchedIndex = -1;
  stored.forEach((entry, i) => {
    if (entry.usedAt === null && hashEquals(entry.hash, candidate) && matchedIndex === -1) {
      matchedIndex = i;
    }
  });
  if (matchedIndex === -1) return null;

  return stored.map((entry, i) => (i === matchedIndex ? { ...entry, usedAt: now } : entry));
}

/** How many codes are still usable. */
export function remainingRecoveryCodes(stored: StoredRecoveryCode[] | null | undefined): number {
  return (stored ?? []).filter((c) => c.usedAt === null).length;
}
