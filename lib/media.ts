import "server-only";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { nanoid } from "nanoid";
import { env } from "@/lib/env";

/**
 * Local media storage for admin-uploaded images (product/shop/reward photos).
 *
 * Files are written to `<data-dir>/uploads` — i.e. alongside the SQLite database
 * on the persisted volume — so uploads survive redeploys (unlike `public/`, which
 * is baked into the image). They are served back through `/api/media/[file]`.
 */

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Absolute path to the uploads directory (next to the DB file). */
export function uploadsDir(): string {
  const dbDir = dirname(resolve(process.cwd(), env.databaseUrl));
  return join(dbDir, "uploads");
}

/** Only simple, generated filenames are ever valid — blocks path traversal. */
const SAFE_NAME = /^[A-Za-z0-9_-]+\.(jpg|png|webp|avif)$/;
export function isSafeMediaName(name: string): boolean {
  return SAFE_NAME.test(name);
}

/**
 * Persist an uploaded image and return its public path (`/api/media/<file>`),
 * or throw a user-facing message on an invalid file. The stored filename is
 * generated (never derived from the client's filename).
 */
export async function saveUploadedImage(file: File): Promise<string> {
  const ext = ALLOWED[file.type];
  if (!ext) throw new Error("Formato immagine non supportato (usa JPG, PNG, WebP o AVIF).");
  if (file.size === 0) throw new Error("Il file immagine è vuoto.");
  if (file.size > MAX_BYTES) throw new Error("L'immagine supera il limite di 5 MB.");

  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  const name = `${nanoid()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(join(dir, name), bytes);
  return `/api/media/${name}`;
}

/** Read a stored media file (for the serving route). Returns null if missing/unsafe. */
export async function readMedia(name: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (!isSafeMediaName(name)) return null;
  const path = join(uploadsDir(), name);
  if (!existsSync(path)) return null;
  const ext = name.split(".").pop()!;
  const contentType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "avif" ? "image/avif" : "image/jpeg";
  return { body: await readFile(path), contentType };
}
