type SealStampProps = {
  className?: string;
  /**
   * Namespace for this instance's `<defs>`.
   *
   * `id` is document-global and `filter`/`href` resolve against the whole
   * document, so two stamps on one page would both draw through whichever
   * `<defs>` mounted first — the ring text of the second would snap onto the
   * first one's path. Same reason `SealSvg` takes one; see the note there.
   */
  uid?: string;
};

/**
 * The deckled wafer the ink is pressed onto.
 *
 * A closed Catmull-Rom through eleven points on a circle of r≈92, each nudged by
 * up to ±2.8 — so the radius wanders between 89.5 and 94.8 and the edge reads as
 * torn rather than die-cut. Generated once from a fixed seed and pasted, because
 * the wobble has to be the same on the server and the client: computing it at
 * render time would be a hydration mismatch, and computing it per-instance would
 * make two stamps on one page visibly different objects.
 */
const DECKLE =
  "M100.0 7.0 C116.9 7.1 136.9 12.0 150.6 21.3 C164.2 30.6 174.8 47.2 181.9 62.6 C189.0 77.9 195.1 96.8 193.4 113.4 C191.7 130.0 183.0 150.0 171.6 162.1 C160.3 174.2 141.5 181.3 125.2 185.9 C108.9 190.4 89.5 193.8 73.7 189.5 C58.0 185.2 41.8 172.6 30.8 159.9 C19.9 147.2 10.9 129.8 8.1 113.2 C5.2 96.7 7.1 76.1 13.9 60.7 C20.7 45.2 34.5 29.4 48.9 20.5 C63.2 11.5 83.1 6.8 100.0 7.0 Z";

/**
 * The shop's mark as a rubber stamp on a paper wafer.
 *
 * This replaces the WebGL coin that used to be the plan for the hero
 * (`Seal3D.tsx`): 255KB of three.js that could not draw a frame until after
 * hydration, for a mark 130px wide. Everything here is in the server HTML and
 * finished at the first paint — no client component, no JavaScript, no request.
 *
 * Two details are what stop it looking like clip art:
 *
 * The ink fails. `feTurbulence` at a high frequency is thresholded into a mask
 * and composited *out* of the artwork, so the strokes are eaten through in
 * places; a second, much slower turbulence displaces the whole thing by a couple
 * of units so no ring is a true circle. Ink that lands evenly everywhere is a
 * print, not a stamp.
 *
 * The wafer. The ink is `--acc-salumi` at 88% and has no luminance of its own, so
 * over the hero photograph it simply disappears — which is exactly what happens
 * when you stamp a dark surface. The disc under it is the honest fix rather than
 * a workaround: a norcino stamps the paper, then the paper goes on the parcel.
 * It is the page's own `--paper`, so on the paper half of the hero only its
 * hairline and its contact shadow are visible and the mark reads as struck
 * straight onto the page; over the photograph it becomes a solid wafer.
 *
 * Decorative: the shop's name, city and founding year are all already in the
 * masthead and the `<h1>` beside it, so announcing them a third time is noise in
 * a screen reader.
 */
export default function SealStamp({ className, uid = "stamp" }: SealStampProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      aria-hidden
      role="presentation"
      focusable="false"
    >
      <defs>
        {/* The two arcs the ring text runs along. Both start at the west point,
            but the lower one sweeps the other way (`1,0` rather than `1,1`) so
            its text sits upright along the bottom of the ring instead of hanging
            upside down under it.

            The radii are set by what the type does either side of the baseline,
            not by eye. On the top arc the caps grow *outward*: at 12 that is
            r=69 + ~8.6, so 77.6 — which has to clear the thin ring at r=79.5.
            On the bottom arc "up" is toward the middle, so its caps grow
            *inward*: r=58 − ~8.2 = 49.8, which has to clear the inner ring at
            r=47. First pass had the top arc at r=72 against a ring at r=80 and
            the two collided; the ring text came out sliced. */}
        <path
          id={`${uid}-arc-top`}
          d="M100,100 m-69,0 a69,69 0 1,1 138,0"
          fill="none"
        />
        <path
          id={`${uid}-arc-bottom`}
          d="M100,100 m-58,0 a58,58 0 1,0 116,0"
          fill="none"
        />
        {/* `DAL 1946` sits *below* `ANCONA` on the shop's own mark, which on a
            `1,0` sweep means a *larger* radius, not a smaller one. At r=74 the
            caps grow inward to ~67.8, so there is a clear band of 10 between
            this line and the one above it, and the baseline still sits inside
            the thin ring at 79.5. */}
        <path
          id={`${uid}-arc-bottom-outer`}
          d="M100,100 m-74,0 a74,74 0 1,0 148,0"
          fill="none"
        />

        <filter
          id={`${uid}-distress`}
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
          // The default `linearRGB` makes the threshold below bite far harder
          // than the numbers suggest, which eats the ring text rather than the
          // edges of the strokes.
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="4" seed="7" result="grain" />
          {/* Only the alpha row is non-zero: the noise is thrown away as colour
              and kept as a stencil, and that stencil is what gets punched out.
              `fractalNoise` centres on 0.5, so the offset is the dial — at −0.28
              the average bite was ~27% and the 10px ring text came out as lace.
              −0.38 leaves the strokes intact and still opens the edges. */}
          <feColorMatrix
            in="grain"
            type="matrix"
            result="stencil"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    1.1 0 0 0 -0.38"
          />
          <feComposite in="SourceGraphic" in2="stencil" operator="out" result="eaten" />
          <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="3" result="warp" />
          <feDisplacementMap
            in="eaten"
            in2="warp"
            scale="2.6"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      {/* The wafer. Painted from the tokens rather than literals so it follows
          the paper if the stock is ever re-pointed. */}
      <path
        d={DECKLE}
        fill="var(--paper)"
        stroke="var(--rule-strong)"
        strokeWidth="1"
        strokeOpacity="0.55"
      />

      {/* Seven degrees off true, because nobody has ever stamped anything
          straight. Rotated as a group so the filter region travels with it. */}
      <g
        filter={`url(#${uid}-distress)`}
        transform="rotate(-7 100 100)"
        fill="var(--acc-salumi)"
        stroke="var(--acc-salumi)"
        opacity="0.9"
      >
        {/* Outer edge lands at r=86. The deckle's radius wanders down to 89.5 and
            the displacement below can throw the ink 2.6 further out, so this is
            the largest ring that cannot print off the edge of its own wafer. */}
        <circle cx="100" cy="100" r="84" fill="none" strokeWidth="4" />
        <circle cx="100" cy="100" r="79.5" fill="none" strokeWidth="1.2" />
        <circle cx="100" cy="100" r="47" fill="none" strokeWidth="1.2" />

        {/* `stroke-width` on the ring text and not just a heavier weight: the
            distress mask removes a fixed amount of ink, so thin strokes lose
            proportionally more of themselves and 10px type turns to lace. */}
        <text
          fontFamily="var(--font-inter-tight), ui-sans-serif, system-ui, sans-serif"
          fontSize="12"
          fontWeight="600"
          letterSpacing="7"
          strokeWidth="0.5"
        >
          <textPath href={`#${uid}-arc-top`} startOffset="50%" textAnchor="middle">
            NORCINERIA
          </textPath>
        </text>
        <text
          fontFamily="var(--font-inter-tight), ui-sans-serif, system-ui, sans-serif"
          fontSize="11.5"
          fontWeight="600"
          letterSpacing="7"
          strokeWidth="0.5"
        >
          <textPath href={`#${uid}-arc-bottom`} startOffset="50%" textAnchor="middle">
            ANCONA
          </textPath>
        </text>
        <text
          fontFamily="var(--font-inter-tight), ui-sans-serif, system-ui, sans-serif"
          fontSize="8.5"
          fontWeight="600"
          letterSpacing="3"
          strokeWidth="0.35"
        >
          <textPath href={`#${uid}-arc-bottom-outer`} startOffset="50%" textAnchor="middle">
            DAL 1946
          </textPath>
        </text>

        {/* The name is the centrepiece — that is the whole shape of the shop's
            own mark (`public/logo-taccalite.png`), where `DAL 1946` is a footnote
            on the bottom rim rather than the thing in the middle. It runs wide
            enough to cross the inner ring, which is why that ring is drawn above
            this and not below it: same ink, and group opacity composites the
            layer once, so the overlap merges instead of double-printing.

            `textLength` rather than a hoped-for font size. `--font-fraunces` is a
            variable face and its fallback is Georgia; nine capitals differ by
            more than a dozen units between the two, which is the difference
            between clearing the thin ring and printing through it. 148 puts the
            ends at r=74 — inside 79.5 with air to spare — in either face. */}
        <text
          x="100"
          y="100"
          textAnchor="middle"
          dominantBaseline="central"
          stroke="none"
          fontFamily="var(--font-fraunces), Georgia, serif"
          fontSize="30"
          fontWeight="700"
          textLength="148"
          lengthAdjust="spacingAndGlyphs"
          style={{ fontVariationSettings: '"SOFT" 20, "WONK" 1' }}
        >
          TACCALITE
        </text>
      </g>
    </svg>
  );
}
