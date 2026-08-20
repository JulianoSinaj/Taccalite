/**
 * The houses whose work sits on our shelves.
 *
 * Names come from the `home.brands` setting (comma-separated) so the shop can
 * edit the list from the gestionale without a deploy. The defaults are only the
 * labels legible in the shop's own photographs — nothing invented.
 */
export const DEFAULT_BRANDS = "Rineri, San Cesario, SIGI, Menchi, Villani";

/**
 * A dark ribbon rather than another pale band.
 *
 * Nine sections of near-white in a row is what made the page read as flat, and
 * these names were the worst of it: set in brown at 45% on paper, the houses the
 * shop is proud to carry were the faintest thing on the page. Cream on brown
 * gives the middle of the page a beat, and gives the names their weight back.
 */
export default function Marche({ brands }: { brands: string[] }) {
  if (brands.length === 0) return null;

  // The track is rendered twice and translated by exactly -50%, so the loop
  // closes on itself and the seam is never on screen.
  const track = [...brands, ...brands];

  return (
    <section
      className="marquee relative overflow-hidden border-y border-brown-950 bg-brown-900 py-16 sm:py-20"
      aria-labelledby="marche-heading"
    >
      <div aria-hidden className="ember absolute inset-0 opacity-70" />
      <div aria-hidden className="bg-noise absolute inset-0 opacity-[0.06]" />

      <div className="relative mx-auto max-w-[88rem] px-5 sm:px-8 lg:px-12">
        <h2
          id="marche-heading"
          className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold uppercase"
        >
          <span aria-hidden className="h-px w-10 bg-gold/60" />
          Le marche che scegliamo
        </h2>
      </div>

      {/* Masked at both ends so the names fade into the paper rather than being
          chopped by the viewport edge. The track keeps travelling regardless of
          the pointer — see `.marquee-track` in globals.css. */}
      <div
        className="relative mt-10 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)",
        }}
      >
        <ul
          className="marquee-track flex w-max items-center gap-14 sm:gap-20"
          style={{ ["--marquee-duration" as string]: `${Math.max(28, brands.length * 7)}s` }}
        >
          {track.map((brand, i) => (
            <li
              key={`${brand}-${i}`}
              aria-hidden={i >= brands.length}
              className="flex shrink-0 items-center gap-14 sm:gap-20"
            >
              <span className="font-display text-[1.75rem] leading-none font-semibold tracking-[-0.02em] whitespace-nowrap text-cream/55 select-none sm:text-[2.25rem]">
                {brand}
              </span>
              <span aria-hidden className="size-1 shrink-0 rotate-45 bg-gold/70" />
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mx-auto mt-10 max-w-[88rem] px-5 sm:px-8 lg:px-12">
        <p className="max-w-xl text-[0.9375rem] leading-relaxed text-cream/60">
          Piccoli produttori e case storiche, scelti perché li abbiamo assaggiati prima noi.
          Quando entra qualcosa di nuovo al banco, lo raccontiamo nel diario.
        </p>
      </div>
    </section>
  );
}
