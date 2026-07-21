import "server-only";
import { createHmac, randomBytes } from "node:crypto";

/**
 * Minimal, dependency-free TOTP (RFC 6238) — SHA-1, 6 digits, 30-second step —
 * compatible with Google Authenticator, Authy, 1Password, etc. Used for optional
 * two-factor auth on back-office accounts.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32-encode raw bytes (RFC 4648, no padding). */
function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Base32-decode (RFC 4648), ignoring spaces/padding/case. */
function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a fresh base32 secret (160 bits). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The TOTP code for a secret at a given time (defaults to now). */
export function totpToken(secret: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter (high word is 0 for any realistic date).
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/** Verify a user-entered code, tolerating ±1 step of clock drift. */
export function verifyTotp(secret: string, token: string, atMs: number = Date.now()): boolean {
  const t = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) return false;
  for (let w = -1; w <= 1; w++) {
    if (totpToken(secret, atMs + w * STEP_SECONDS * 1000) === t) return true;
  }
  return false;
}

/** otpauth:// provisioning URI for QR enrolment. */
export function otpauthUri(secret: string, account: string, issuer = "Taccalite"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
