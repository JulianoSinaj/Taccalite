/**
 * The attribution line for photographs that are not the shop's own.
 *
 * Most of `public/images` is bottega photography — the counter, the trays, the
 * salumi on their hooks — and needs no credit. Two files do, both Wikimedia
 * Commons porchette standing in until someone photographs one of ours: see
 * `CREDITS` below. Those licences require the credit to appear
 * *wherever the photo appears*, and the credit used to be a hardcoded line in
 * `home/Porchetta.tsx` — so the obligation lived in one component rather than
 * with the file, and the second use of the photo would have silently dropped it.
 *
 * Keying the credit off the `src` fixes the direction of the dependency: the
 * attribution follows the image, and a page that renders a credited photo
 * without this component is the bug, not the default. Replace the photo with a
 * real one and the entry disappears from `CREDITS`, which is the whole cleanup.
 */

/** `src` → the credit its licence requires. Absent means "ours, no credit". */
const CREDITS: Record<string, string> = {
  "/images/porchetta-al-forno.jpg": "Foto: Popo le Chien, CC BY-SA 3.0",
  // Wikimedia Commons `Porchetta (3168207946).jpg` by Pedro Angelini, CC BY
  // 2.0. Stands in for the "Il sapore perfetto" band on /porchetta, which for
  // want of a porchetta photograph was showing salumi in stagionatura.
  "/images/porchetta-crosta-croccante.jpg": "Foto: Pedro Angelini, CC BY 2.0",
  // `tagliere-formaggi.jpg` (Peachyeung316, CC BY-SA 4.0) used to be here. The
  // shop's own board replaced it, so the obligation ended with the file —
  // exactly the cleanup this map is shaped for. The stale JPEG is still in
  // `public/images/` and can be deleted; nothing references it.
};

/** The credit for `src`, or `undefined` when the photo is the shop's own. */
export function photoCredit(src: string): string | undefined {
  return CREDITS[src];
}

/**
 * Renders the credit for `src`, or nothing at all. Absolutely positioned, so
 * the caller only has to be `relative` — which every image frame here already
 * is, because `next/image` with `fill` requires it.
 */
export function PhotoCredit({
  src,
  className = "",
}: {
  src: string;
  className?: string;
}) {
  const credit = photoCredit(src);
  if (!credit) return null;

  return (
    <>
      {/* A scrim, not a shadow: the credit sits on whatever the photo happens
          to be at that corner, and cream-on-cream is unreadable. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-brown-950/70 to-transparent"
      />
      <p className={`absolute right-2 bottom-1 text-[0.5625rem] text-cream/60 ${className}`}>
        {credit}
      </p>
    </>
  );
}
