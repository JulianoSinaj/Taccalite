# System 17 — Media & Assets

**Readiness: 87 / 100** — *production-solid*
*(76 at audit; the one finding fixed 2026-09-02.)*

Scope: upload, storage (local `data/uploads` in dev, Vercel Blob in prod),
serving, attachment to products/shops/posts/rewards, orphan cleanup.

| Axis | Weight | At audit | Now | Weighted |
|---|---|---|---|---|
| Correctness | 30% | 86 | 88 | 26.4 |
| Robustness | 25% | 82 | 84 | 21.0 |
| Security & compliance | 20% | 72 | **90** | 18.0 |
| Observability & operability | 15% | 78 | 78 | 11.7 |
| Test & documentation cover | 10% | 30 | **86** | 8.6 |
| **Total** | | **76** | | **85.7 → 87** |

`vitest` 792 / 66. This system had **no tests at all** at audit; it has ten now.

---

## Finding: the file's type was whatever the upload claimed — **fixed**

`saveUploadedImage` mapped `file.type` through an allowlist to an extension, and
stored the bytes under it. But `File.type` is the browser's `Content-Type` on
the multipart part — which is to say, **whatever the client wrote there**.

So any bytes at all could be stored, and served back from the shop's own domain
under an image content type at a stable public URL. `X-Content-Type-Options:
nosniff` (system 20) and a non-executable content type keep that short of stored
XSS — but "the only thing standing between this and a hosted payload is a
response header" is not where the check belongs, and the surrounding code is
otherwise careful about exactly this class of thing.

**Fixed** — a new `sniffImageKind` reads the actual signature (JPEG SOI, the PNG
8-byte header, a RIFF container whose form type is `WEBP`, an ISO-BMFF box whose
brand is `avif`/`avis`), and **both** the stored extension and the served
content type now come from the bytes rather than the claim. A genuine PNG
announced as a JPEG is stored as a PNG; a script announced as a JPEG is refused.

The claimed type is still checked first, only so an obviously wrong upload gets
the friendly "usa JPG, PNG, WebP o AVIF" rather than the byte-level message.

Ten tests, including a `<script>` payload wearing `image/jpeg`, a RIFF container
that is a WAV rather than a WebP, an MZ executable, and a client filename of
`../../etc/passwd.png`.

---

## What I checked and found clean

- **The stored filename is generated, never derived from the client's.** A
  `nanoid()` plus the extension, so the traversal attempt above lands as an
  ordinary random name.
- **`isSafeMediaName` is a strict allowlist** — `^[A-Za-z0-9_-]+\.(jpg|png|webp|avif)$`
  — applied on the read path, so the serving route cannot be walked out of the
  uploads directory even if something upstream went wrong. `.svg` is
  deliberately not in the list, which is the right call: SVG is a script
  container.
- **A 5 MB cap and an empty-file check**, both with user-facing messages.
- **Serving sets `immutable` caching**, correct because names are unique and
  content never changes under one.
- **Local and Blob storage are one code path** with the same validation, so the
  dev and production behaviours cannot drift.
- Test uploads land in the gitignored `.vitest-tmp/uploads`, not in the repo.

---

## Still open

- **Nothing strips image metadata.** An uploaded photo keeps its EXIF, including
  GPS coordinates if the phone recorded them — so a shop photographing a product
  at home publishes that location. Not a defect in the code as written, but a
  real consequence of storing bytes verbatim.
- **`sweepOrphanedMedia` exists but is not wired into the maintenance cron**, so
  orphan cleanup is a manual act.
- **No dimension or re-encode step.** A 5 MB 6000×4000 JPEG is stored and served
  as-is; `next/image` handles the storefront, but the admin previews the
  original.
