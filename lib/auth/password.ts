import { randomBytes, scrypt, scryptSync, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with Node's built-in scrypt — no native deps beyond core.
 *
 * Format (current): `scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>` — the KDF cost
 * parameters are stored inline so they can be raised over time and older hashes
 * still verify (and are transparently upgraded on next login, see `needsRehash`).
 *
 * Legacy format (`scrypt$<saltHex>$<hashHex>`, no params) is still accepted and
 * interpreted with Node's historical defaults (N=2^14) so existing accounts keep
 * working; those hashes report `needsRehash === true`.
 *
 * Cost: N=2^16 (r=8, p=1) ≈ 64 MiB per hash. This is a large step up from the old
 * N=2^14 (~16 MiB) toward OWASP guidance while staying comfortably within the
 * 512 MiB production container even under the (rate-limited) login concurrency of
 * a two-shop business. `maxmem` is raised so Node permits the larger N.
 */
const KEYLEN = 64;
const PARAMS = { N: 1 << 16, r: 8, p: 1 } as const;
const LEGACY_PARAMS = { N: 1 << 14, r: 8, p: 1 } as const;
// scrypt memory use ≈ 128 * N * r bytes; give generous headroom above that.
const MAXMEM = 128 * 1024 * 1024;

// promisify() only surfaces scrypt's no-options overload; retype it so the
// cost-parameter options argument is accepted.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

type Params = { N: number; r: number; p: number };

function encode(salt: Buffer, hash: Buffer, params: Params): string {
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Parse a stored hash into its params + salt + expected digest, or null if malformed. */
function decode(stored: string): { params: Params; salt: Buffer; expected: Buffer; legacy: boolean } | null {
  const parts = stored.split("$");
  if (parts[0] !== "scrypt") return null;
  if (parts.length === 6) {
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!N || !r || !p) return null;
    return { params: { N, r, p }, salt: Buffer.from(parts[4], "hex"), expected: Buffer.from(parts[5], "hex"), legacy: false };
  }
  if (parts.length === 3) {
    // Legacy: no inline params → historical Node defaults.
    return { params: LEGACY_PARAMS, salt: Buffer.from(parts[1], "hex"), expected: Buffer.from(parts[2], "hex"), legacy: true };
  }
  return null;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { ...PARAMS, maxmem: MAXMEM });
  return encode(salt, hash, PARAMS);
}

export function verifyPassword(password: string, stored: string): boolean {
  const d = decode(stored);
  if (!d) return false;
  const actual = scryptSync(password, d.salt, d.expected.length, { ...d.params, maxmem: MAXMEM });
  return d.expected.length === actual.length && timingSafeEqual(d.expected, actual);
}

export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(password, salt, KEYLEN, { ...PARAMS, maxmem: MAXMEM })) as Buffer;
  return encode(salt, hash, PARAMS);
}

export async function verifyPasswordAsync(password: string, stored: string): Promise<boolean> {
  const d = decode(stored);
  if (!d) return false;
  const actual = (await scryptAsync(password, d.salt, d.expected.length, { ...d.params, maxmem: MAXMEM })) as Buffer;
  return d.expected.length === actual.length && timingSafeEqual(d.expected, actual);
}

/**
 * True when a stored hash uses weaker-than-current parameters (or the legacy
 * paramless format) and should be re-hashed. Callers re-hash on a successful
 * login — the only moment the plaintext is available — so accounts upgrade
 * silently without forcing a reset.
 */
export function needsRehash(stored: string): boolean {
  const d = decode(stored);
  if (!d) return true;
  return d.legacy || d.params.N < PARAMS.N || d.params.r < PARAMS.r || d.params.p < PARAMS.p;
}

/**
 * A precomputed hash of a throwaway password. Verifying against it when a
 * username doesn't exist keeps login response time roughly constant, so timing
 * can't be used to enumerate valid usernames.
 */
export const DUMMY_PASSWORD_HASH = hashPassword("timing-equalizer-not-a-real-password");
