import type { InstagramFeed, InstagramPost, InstagramProfile } from "./parse";

/**
 * A snapshot of the shop's real Instagram, shipped with the site.
 *
 * The live feed needs a long-lived Graph token (Impostazioni → Instagram in the
 * gestionale). Until one is connected — and whenever Instagram is unreachable
 * with no cached copy — the homepage would otherwise show a "follow us" band
 * with no photographs in it, on a page whose whole argument is that this is a
 * real shop with a real counter.
 *
 * So the posts below are the genuine article: captured from
 * instagram.com/norcinerataccalite on 2026-09-01, images saved to
 * `public/images/instagram/` (named by their Instagram shortcode) and captions
 * transcribed from the posts themselves — the shop's own words, with the
 * decorative maths-alphabet capitals and the hashtag tails normalised away.
 * Every tile still links to the post it came from.
 *
 * Deliberately *not* written into the `instagram.feedCache` setting: this is a
 * floor under the section, not a cache. The moment a token is connected the
 * live feed replaces it wholesale, and the gestionale's own status panel keeps
 * reporting on the live fetch alone, so "connected" never quietly means "still
 * showing the archive".
 *
 * Counts are the post's own likes/comments at capture time. The profile's
 * follower and media counts are deliberately omitted rather than frozen: a
 * number that only ever goes stale is worse than the tagline it falls back to.
 */

/** Where the saved copies live, one JPEG per shortcode. */
const DIR = "/images/instagram";

type Seed = {
  /** Instagram shortcode — the `/p/<code>/` segment. Doubles as the file name. */
  code: string;
  /** `p` for a photo/album permalink, `reel` for a reel. */
  kind: "p" | "reel";
  mediaType: InstagramPost["mediaType"];
  /** Post date, noon Europe/Rome — Instagram only exposes the day publicly. */
  timestamp: string;
  caption: string;
  likeCount: number;
  commentsCount: number;
};

/** Newest first, exactly as the profile grid orders them (pinned reels last). */
const SEEDS: Seed[] = [
  {
    code: "DY6kXqoghop",
    kind: "p",
    mediaType: "IMAGE",
    timestamp: "2026-05-29T12:00:00+02:00",
    caption:
      "Formaggi cremosi: il piacere che si scioglie al cuore. Taleggio, gorgonzola, roquefort e nuvola di capra — con le confetture e il miele per l'abbinamento.",
    likeCount: 7,
    commentsCount: 0,
  },
  {
    code: "DYwlyX_AnSr",
    kind: "p",
    mediaType: "IMAGE",
    timestamp: "2026-05-25T12:00:00+02:00",
    caption:
      "I preparati Taccalite: pronti, freschi, irresistibili. Ogni giorno primi, secondi e contorni preparati con cura, proprio come fatti in casa.",
    likeCount: 15,
    commentsCount: 0,
  },
  {
    code: "DYo3VXECHDM",
    kind: "p",
    mediaType: "IMAGE",
    timestamp: "2026-05-22T12:00:00+02:00",
    caption:
      "Dolci fatti in casa, come una volta: crostata alle albicocche, torta della nonna e le varianti che cambiano ogni giorno.",
    likeCount: 10,
    commentsCount: 0,
  },
  {
    code: "DYhI7ahDTBY",
    kind: "p",
    mediaType: "CAROUSEL_ALBUM",
    timestamp: "2026-05-19T12:00:00+02:00",
    caption:
      "Prosciutto di Norcia IGP: un prosciutto dal carattere forte, per chi ama i sapori autentici e decisi.",
    likeCount: 9,
    commentsCount: 0,
  },
  {
    code: "DYW1wh5gWHN",
    kind: "p",
    mediaType: "CAROUSEL_ALBUM",
    timestamp: "2026-05-15T12:00:00+02:00",
    caption:
      "Rubrica settimanale, i nostri formaggi: il formaggio di Fossa avvolto nelle foglie di noce, dalla tradizione dell'Appennino fra Marche e Romagna.",
    likeCount: 15,
    commentsCount: 0,
  },
  {
    code: "DYPHY-GCH38",
    kind: "p",
    mediaType: "IMAGE",
    timestamp: "2026-05-12T12:00:00+02:00",
    caption:
      "Prodotti per ogni tipo di alimentazione: pasta di Noja al farro e al grano saraceno, biscotti al Kamut, ceci neri e prodotti senza lattosio.",
    likeCount: 6,
    commentsCount: 0,
  },
  {
    code: "DYE0WXfnDu7",
    kind: "p",
    mediaType: "IMAGE",
    timestamp: "2026-05-08T12:00:00+02:00",
    caption:
      "Le vostre parole sono il nostro orgoglio: qualità, sapori autentici, gentilezza e tradizione. Grazie di cuore.",
    likeCount: 6,
    commentsCount: 0,
  },
  {
    code: "DXrV-VfiHW0",
    kind: "p",
    mediaType: "IMAGE",
    timestamp: "2026-04-28T12:00:00+02:00",
    caption:
      "Dal 1 al 4 maggio ci trovi in via XXXIV Settembre, lato porto, per la Fiera di San Ciriaco.",
    likeCount: 56,
    commentsCount: 2,
  },
  {
    code: "DXofqfWCIZ6",
    kind: "p",
    mediaType: "IMAGE",
    timestamp: "2026-04-27T12:00:00+02:00",
    caption:
      "Freschezza ogni giorno: insalata già tagliata e verdure già pulite, pronte da cuocere.",
    likeCount: 13,
    commentsCount: 0,
  },
  {
    code: "DXl6uediCSx",
    kind: "p",
    mediaType: "CAROUSEL_ALBUM",
    timestamp: "2026-04-26T12:00:00+02:00",
    caption:
      "Il Macchiaiolo: pecorino stagionato al tartufo, intenso e raffinato, dalla tradizione casearia dell'Italia centrale.",
    likeCount: 8,
    commentsCount: 0,
  },
  {
    code: "DUxrDU7kpVu",
    kind: "reel",
    mediaType: "VIDEO",
    timestamp: "2026-02-15T12:00:00+01:00",
    caption:
      "«Lavoriamo maiali da cinquant'anni e non abbiamo mai fatto una porcata.» La nostra storia, nel cuore di Ancona.",
    likeCount: 137,
    commentsCount: 12,
  },
  {
    code: "DUILBVFD00O",
    kind: "reel",
    mediaType: "VIDEO",
    timestamp: "2026-01-30T12:00:00+01:00",
    caption:
      "Dove siamo: passo dopo passo fino al nostro locale in Piazza Kennedy 10, nel centro di Ancona.",
    likeCount: 8,
    commentsCount: 0,
  },
];

export const FALLBACK_POSTS: InstagramPost[] = SEEDS.map((seed) => ({
  // Real media ids are numeric, but nothing here depends on that — the
  // shortcode is unique, stable, and readable in a React key.
  id: seed.code,
  permalink: `https://www.instagram.com/norcinerataccalite/${seed.kind}/${seed.code}/`,
  imageUrl: `${DIR}/${seed.code}.jpg`,
  mediaType: seed.mediaType,
  caption: seed.caption,
  timestamp: seed.timestamp,
  likeCount: seed.likeCount,
  commentsCount: seed.commentsCount,
}));

export const FALLBACK_PROFILE: InstagramProfile = {
  id: "norcinerataccalite",
  username: "norcinerataccalite",
  name: "NorcineriaTaccalite",
  followersCount: null,
  mediaCount: null,
  profilePictureUrl: `${DIR}/profilo.jpg`,
};

/** `fetchedAt: 0` — nothing was fetched; this is the shipped archive. */
export const FALLBACK_FEED: InstagramFeed = {
  profile: FALLBACK_PROFILE,
  posts: FALLBACK_POSTS,
  fetchedAt: 0,
};
