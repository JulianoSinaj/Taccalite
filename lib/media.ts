import "server-only";
import { mkdir, writeFile, readFile, readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { products, shops, blogPosts, rewards } from "@/lib/db/schema";
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

/** The stored filename behind a `/api/media/<file>` path, or null for anything
 *  else (an external URL, an empty field, a hand-written path). */
export function mediaNameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const match = /^\/api\/media\/([^/?#]+)$/.exec(path.trim());
  const name = match?.[1];
  return name && isSafeMediaName(name) ? name : null;
}

/** Every upload filename currently referenced by a row, across all four tables
 *  whose records can carry an image. */
async function referencedMediaNames(): Promise<Set<string>> {
  const [productRows, shopRows, postRows, rewardRows] = await Promise.all([
    db.select({ image: products.image }).from(products),
    db.select({ image: shops.image }).from(shops),
    db.select({ image: blogPosts.image }).from(blogPosts),
    db.select({ image: rewards.image }).from(rewards),
  ]);

  const names = new Set<string>();
  for (const row of [...productRows, ...shopRows, ...postRows, ...rewardRows]) {
    const name = mediaNameFromPath(row.image);
    if (name) names.add(name);
  }
  return names;
}

/**
 * Delete uploaded images no row points at any more.
 *
 * Replacing or deleting a product/shop/post/reward only rewrites the `image`
 * column — the file itself stayed on the volume forever, so storage grew
 * monotonically with every re-upload. Rather than trying to delete the old file
 * at each of those call sites (and getting it wrong when two rows share an
 * image, or when a save fails halfway), this reconciles the directory against
 * the database.
 *
 * `minAgeMs` is the safety margin that makes it correct to run concurrently with
 * an upload: a file written seconds ago may belong to a save that hasn't
 * committed its row yet, so only files older than the margin are considered.
 * Runs from the daily maintenance job.
 */
export async function sweepOrphanedMedia(
  now = new Date(),
  minAgeMs = 24 * 60 * 60 * 1000,
): Promise<{ deleted: number; bytesFreed: number }> {
  const dir = uploadsDir();
  if (!existsSync(dir)) return { deleted: 0, bytesFreed: 0 };

  const [entries, referenced] = await Promise.all([readdir(dir), referencedMediaNames()]);
  const cutoff = now.getTime() - minAgeMs;

  let deleted = 0;
  let bytesFreed = 0;
  for (const name of entries) {
    // Never touch anything that doesn't look like one of our generated uploads.
    if (!isSafeMediaName(name) || referenced.has(name)) continue;
    try {
      const info = await stat(join(dir, name));
      if (!info.isFile() || info.mtimeMs > cutoff) continue;
      await unlink(join(dir, name));
      deleted += 1;
      bytesFreed += info.size;
    } catch {
      // A file vanishing under us (or an unreadable entry) is not a failure —
      // the next sweep will reconcile whatever is left.
    }
  }
  return { deleted, bytesFreed };
}
