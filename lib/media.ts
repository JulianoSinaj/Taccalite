import "server-only";
// The cwd-rooted paths below carry `turbopackIgnore` comments so the file tracer
// doesn't fall back to tracing the whole project — see lib/db/connection.ts.
import { mkdir, writeFile, readFile, readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { nanoid } from "nanoid";
import { put, list, del } from "@vercel/blob";
import { db } from "@/lib/db/client";
import { localDatabaseDir } from "@/lib/db/connection";
import { products, shops, blogPosts, rewards } from "@/lib/db/schema";
import { env, blobConfigured } from "@/lib/env";

/**
 * Media storage for admin-uploaded images (product/shop/reward photos).
 *
 * Two backends, picked by configuration:
 *
 * - **Local disk** (dev, Docker): files go to `<data-dir>/uploads`, next to the
 *   SQLite database on the persisted volume, and are served back through
 *   `/api/media/[file]`. The stored `image` value is `/api/media/<file>`.
 * - **Vercel Blob** (serverless — no persistent disk): when
 *   `BLOB_READ_WRITE_TOKEN` is set, files are uploaded to the project's Blob
 *   store under `uploads/<file>` and the stored `image` value is the blob's
 *   public `https://…public.blob.vercel-storage.com/uploads/<file>` URL, which
 *   `next/image` is allowed to load (see `next.config.ts` remotePatterns).
 *
 * Both are reconciled by the daily orphan sweep, so a replaced photo doesn't
 * live forever.
 */

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export type ImageKind = "jpg" | "png" | "webp" | "avif";

/**
 * What the bytes actually are, regardless of what the upload claimed.
 *
 * `File.type` is the browser's `Content-Type` on the multipart part — which is
 * to say, whatever the client wrote there. Trusting it meant any bytes at all
 * could be stored and served back from the shop's own domain under an image
 * content type, at a stable public URL. `nosniff` and a non-executable
 * content type keep that from becoming stored XSS, but "the only thing standing
 * between this and a hosted payload is a response header" is not where the
 * check belongs. The file is whatever its first bytes say it is.
 */
export function sniffImageKind(bytes: Buffer): ImageKind | null {
  if (bytes.length < 12) return null;
  // JPEG: SOI + marker.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  // PNG: the 8-byte signature.
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  // WebP: a RIFF container whose form type is WEBP.
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") {
    return "webp";
  }
  // AVIF: an ISO-BMFF box whose brand is avif (or avis, the sequence variant).
  if (bytes.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("latin1");
    if (brand === "avif" || brand === "avis") return "avif";
  }
  return null;
}

const CONTENT_TYPE: Record<ImageKind, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const BLOB_PREFIX = "uploads/";

/** Absolute path to the local uploads directory (next to the DB file, or
 *  `./data/uploads` when the DB is remote and Blob is not configured). */
export function uploadsDir(): string {
  const dbDir = localDatabaseDir(env.databaseUrl) ?? resolve(/* turbopackIgnore: true */ process.cwd(), "data");
  return join(/* turbopackIgnore: true */ dbDir, "uploads");
}

/** Only simple, generated filenames are ever valid — blocks path traversal. */
const SAFE_NAME = /^[A-Za-z0-9_-]+\.(jpg|png|webp|avif)$/;
export function isSafeMediaName(name: string): boolean {
  return SAFE_NAME.test(name);
}

function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()!;
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "avif" ? "image/avif" : "image/jpeg";
}

/**
 * Persist an uploaded image and return the value to store in the row's `image`
 * column (`/api/media/<file>` locally, an absolute Blob URL on Vercel), or throw
 * a user-facing message on an invalid file. The stored filename is generated
 * (never derived from the client's filename).
 */
export async function saveUploadedImage(file: File): Promise<string> {
  // The claimed type is checked first only so an obviously wrong upload gets the
  // friendly message rather than the byte-level one.
  if (!ALLOWED[file.type]) throw new Error("Formato immagine non supportato (usa JPG, PNG, WebP o AVIF).");
  if (file.size === 0) throw new Error("Il file immagine è vuoto.");
  if (file.size > MAX_BYTES) throw new Error("L'immagine supera il limite di 5 MB.");

  const bytes = Buffer.from(await file.arrayBuffer());
  // The extension, and the content type it will be served under, come from the
  // bytes rather than the claim — so a renamed payload is stored as nothing at
  // all instead of as the image it said it was.
  const ext = sniffImageKind(bytes);
  if (!ext) {
    throw new Error("Il file non è un'immagine valida (JPG, PNG, WebP o AVIF).");
  }

  const name = `${nanoid()}.${ext}`;

  if (blobConfigured) {
    const blob = await put(`${BLOB_PREFIX}${name}`, bytes, {
      access: "public",
      contentType: CONTENT_TYPE[ext],
      addRandomSuffix: false,
      token: env.blobToken,
    });
    return blob.url;
  }

  if (process.env.VERCEL) {
    // Serverless has no writable persistent disk: uploads need the Blob store.
    throw new Error(
      "Archiviazione immagini non configurata: su Vercel collega un Blob store al progetto (Storage → Blob) e ridistribuisci.",
    );
  }
  const dir = uploadsDir();
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
  await writeFile(join(/* turbopackIgnore: true */ dir, name), bytes);
  return `/api/media/${name}`;
}

/** Read a locally stored media file (for the serving route). Returns null if
 *  missing/unsafe. Blob-hosted images are served by Vercel directly. */
export async function readMedia(name: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (!isSafeMediaName(name)) return null;
  const path = join(/* turbopackIgnore: true */ uploadsDir(), name);
  if (!existsSync(/* turbopackIgnore: true */ path)) return null;
  return { body: await readFile(/* turbopackIgnore: true */ path), contentType: contentTypeFor(name) };
}

/** The stored filename behind a `/api/media/<file>` path, or null for anything
 *  else (an external URL, an empty field, a hand-written path). */
export function mediaNameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const match = /^\/api\/media\/([^/?#]+)$/.exec(path.trim());
  const name = match?.[1];
  return name && isSafeMediaName(name) ? name : null;
}

/** The `uploads/<file>` pathname behind one of our Blob URLs, or null. */
export function blobPathnameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" || !u.hostname.endsWith(".public.blob.vercel-storage.com")) return null;
    const pathname = u.pathname.replace(/^\//, "");
    if (!pathname.startsWith(BLOB_PREFIX)) return null;
    return isSafeMediaName(pathname.slice(BLOB_PREFIX.length)) ? pathname : null;
  } catch {
    return null;
  }
}

/** Every `image` value currently referenced by a row, across all four tables
 *  whose records can carry an image. */
async function referencedImages(): Promise<string[]> {
  const [productRows, shopRows, postRows, rewardRows] = await Promise.all([
    db.select({ image: products.image }).from(products),
    db.select({ image: shops.image }).from(shops),
    db.select({ image: blogPosts.image }).from(blogPosts),
    db.select({ image: rewards.image }).from(rewards),
  ]);
  return [...productRows, ...shopRows, ...postRows, ...rewardRows]
    .map((r) => r.image)
    .filter((v): v is string => typeof v === "string" && v !== "");
}

/**
 * Delete uploaded images no row points at any more.
 *
 * Replacing or deleting a product/shop/post/reward only rewrites the `image`
 * column — the file itself stayed in storage forever, so usage grew
 * monotonically with every re-upload. Rather than trying to delete the old file
 * at each of those call sites (and getting it wrong when two rows share an
 * image, or when a save fails halfway), this reconciles storage against the
 * database.
 *
 * `minAgeMs` is the safety margin that makes it correct to run concurrently with
 * an upload: a file written seconds ago may belong to a save that hasn't
 * committed its row yet, so only files older than the margin are considered.
 * Runs from the daily maintenance job. Sweeps whichever backend is active.
 */
export async function sweepOrphanedMedia(
  now = new Date(),
  minAgeMs = 24 * 60 * 60 * 1000,
): Promise<{ deleted: number; bytesFreed: number }> {
  const cutoff = now.getTime() - minAgeMs;
  return blobConfigured ? sweepBlob(cutoff) : sweepLocal(cutoff);
}

async function sweepLocal(cutoff: number): Promise<{ deleted: number; bytesFreed: number }> {
  const dir = uploadsDir();
  if (!existsSync(/* turbopackIgnore: true */ dir)) return { deleted: 0, bytesFreed: 0 };

  const [entries, images] = await Promise.all([readdir(/* turbopackIgnore: true */ dir), referencedImages()]);
  const referenced = new Set<string>();
  for (const v of images) {
    const name = mediaNameFromPath(v);
    if (name) referenced.add(name);
  }

  let deleted = 0;
  let bytesFreed = 0;
  for (const name of entries) {
    // Never touch anything that doesn't look like one of our generated uploads.
    if (!isSafeMediaName(name) || referenced.has(name)) continue;
    try {
      const info = await stat(join(/* turbopackIgnore: true */ dir, name));
      if (!info.isFile() || info.mtimeMs > cutoff) continue;
      await unlink(join(/* turbopackIgnore: true */ dir, name));
      deleted += 1;
      bytesFreed += info.size;
    } catch {
      // A file vanishing under us (or an unreadable entry) is not a failure —
      // the next sweep will reconcile whatever is left.
    }
  }
  return { deleted, bytesFreed };
}

async function sweepBlob(cutoff: number): Promise<{ deleted: number; bytesFreed: number }> {
  const images = await referencedImages();
  const referenced = new Set<string>();
  for (const v of images) {
    const pathname = blobPathnameFromUrl(v);
    if (pathname) referenced.add(pathname);
  }

  let deleted = 0;
  let bytesFreed = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000, token: env.blobToken });
    const stale = page.blobs.filter(
      (b) =>
        isSafeMediaName(b.pathname.slice(BLOB_PREFIX.length)) &&
        !referenced.has(b.pathname) &&
        b.uploadedAt.getTime() <= cutoff,
    );
    if (stale.length > 0) {
      try {
        await del(
          stale.map((b) => b.url),
          { token: env.blobToken },
        );
        deleted += stale.length;
        bytesFreed += stale.reduce((sum, b) => sum + b.size, 0);
      } catch {
        // Best-effort, same as the local sweep — the next run retries.
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return { deleted, bytesFreed };
}
