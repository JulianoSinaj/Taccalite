/**
 * Instagram Graph API → app-level shapes. Pure functions (no I/O) so they can be
 * unit-tested and reused by both the server module and the admin panel.
 *
 * API reference (Instagram API with Instagram Login):
 *   GET https://graph.instagram.com/{version}/me/media?fields=...
 *   GET https://graph.instagram.com/{version}/me?fields=...
 */

export type InstagramMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";

export type InstagramPost = {
  id: string;
  permalink: string;
  /** Displayable still: `media_url` for images, `thumbnail_url` for videos. */
  imageUrl: string;
  mediaType: InstagramMediaType;
  caption: string | null;
  /** ISO-8601 timestamp from the API. */
  timestamp: string;
  likeCount: number | null;
  commentsCount: number | null;
};

export type InstagramProfile = {
  id: string;
  username: string;
  name: string | null;
  followersCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
};

export type InstagramFeed = {
  profile: InstagramProfile | null;
  posts: InstagramPost[];
  /** Epoch ms of the successful upstream fetch that produced this feed. */
  fetchedAt: number;
};

/** Fields we request. `like_count`/`comments_count` are only served for
 *  professional (business/creator) accounts — see `MEDIA_FIELDS_BASIC` fallback. */
export const MEDIA_FIELDS_RICH =
  "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count";
export const MEDIA_FIELDS_BASIC = "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp";
export const PROFILE_FIELDS_RICH = "id,username,name,followers_count,media_count,profile_picture_url";
export const PROFILE_FIELDS_BASIC = "id,username";

const MEDIA_TYPES = new Set<InstagramMediaType>(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function optString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function optNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
/** Only accept https URLs — media_url/permalink are rendered as <img>/<a>. */
function httpsUrl(v: unknown): string | null {
  const s = optString(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

/** Normalise one raw `media` node. Returns null when it can't be displayed
 *  (missing image, non-https, unknown type). */
export function parseMediaNode(raw: unknown): InstagramPost | null {
  if (!isRecord(raw)) return null;
  const id = optString(raw.id);
  const permalink = httpsUrl(raw.permalink);
  const type = optString(raw.media_type);
  if (!id || !permalink || !type || !MEDIA_TYPES.has(type as InstagramMediaType)) return null;
  const mediaType = type as InstagramMediaType;

  // Videos/reels: `media_url` is an mp4 — use the poster frame instead.
  const imageUrl =
    mediaType === "VIDEO"
      ? (httpsUrl(raw.thumbnail_url) ?? null)
      : (httpsUrl(raw.media_url) ?? httpsUrl(raw.thumbnail_url));
  if (!imageUrl) return null;

  const timestamp = optString(raw.timestamp);
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return null;

  return {
    id,
    permalink,
    imageUrl,
    mediaType,
    caption: optString(raw.caption),
    timestamp,
    likeCount: optNumber(raw.like_count),
    commentsCount: optNumber(raw.comments_count),
  };
}

/** Parse a `/me/media` payload into displayable posts (newest first, as served). */
export function parseMediaResponse(payload: unknown, limit = Infinity): InstagramPost[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  const out: InstagramPost[] = [];
  for (const node of payload.data) {
    const post = parseMediaNode(node);
    if (post) out.push(post);
    if (out.length >= limit) break;
  }
  return out;
}

/** Parse a `/me` payload into a profile. */
export function parseProfileResponse(payload: unknown): InstagramProfile | null {
  if (!isRecord(payload)) return null;
  const id = optString(payload.id);
  const username = optString(payload.username);
  if (!id || !username) return null;
  return {
    id,
    username,
    name: optString(payload.name),
    followersCount: optNumber(payload.followers_count),
    mediaCount: optNumber(payload.media_count),
    profilePictureUrl: httpsUrl(payload.profile_picture_url),
  };
}

/** Extract a human-readable message from a Graph API error body. */
export function graphErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && isRecord(payload.error)) {
    const msg = optString(payload.error.message);
    const code = optNumber(payload.error.code);
    if (msg) return code != null ? `${msg} (codice ${code})` : msg;
  }
  return fallback;
}

/** Graph API error `code` (e.g. 190 = OAuth/token, 100 = invalid parameter/field). */
export function graphErrorCode(payload: unknown): number | null {
  if (isRecord(payload) && isRecord(payload.error)) return optNumber(payload.error.code);
  return null;
}

/** Trim a caption for card overlays: first paragraph, hashtags stripped, capped. */
export function captionExcerpt(caption: string | null, max = 110): string {
  if (!caption) return "";
  const firstPara = caption.split(/\n{2,}/)[0] ?? "";
  const noTags = firstPara
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (noTags.length <= max) return noTags;
  const cut = noTags.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max).trimEnd()}…`;
}

/** Compact Italian formatting for counts: 779 → "779", 12_400 → "12,4k". */
export function formatCount(n: number | null): string | null {
  if (n == null) return null;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "").replace(".", ",")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "").replace(".", ",")}M`;
}
