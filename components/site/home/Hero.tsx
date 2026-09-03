import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import CTA from "@/components/site/CTA";
import RevealLines from "@/components/site/RevealLines";
import { emphasise } from "@/components/site/Headline";
import ParallaxMedia from "@/components/site/ParallaxMedia";
import SealStamp from "@/components/site/SealStamp";

type HeroProps = {
  /** Rendered as the live "aperto adesso" pill. Null when hours can't be read. */
  openNow: boolean | null;
  /** Editable in the gestionale (`home.hero.facts`); the page resolves them. */
  facts: string[];
  /** `home.hero.titolo` — deliberate line breaks, `**…**` for the gold fragment. */
  titolo: string[];
  /** `home.hero.testo` — the paragraph under the headline. */
  testo: string;
};

/**
 * The hero, set as a plate on a counter rather than a photo in a box.
 *
 * Three things were wrong with the split it replaces, and each one is a rule the
 * layout now keeps:
 *
 * **The photograph fought the palette.** It was `banco-carni-macinati` — the
 * chilled counter shot under the magenta LEDs every butcher runs, which is
 * exactly the colour the design system forbids everywhere else. On warm paper it
 * read as a screenshot of a different website. `prosciutto-crudo-tagliere` is
 * the shop's two halves in one frame — a crudo at the cut and a gorgonzola,
 * which is Mercato del Piano and Centro respectively — lit warm enough to
 * belong to this ground. Chosen by the owner from a set of candidates, and a
 * stand-in: see the note on the `<Image/>` below.
 *
 * **The frame floated.** A 4:5 box centred in its column, margins on all four
 * sides, is the shape of a placeholder. Editorial layouts anchor the picture to
 * an edge: above `lg` the plate bleeds through the right gutter to the viewport
 * edge, and a slab of counter marble runs under and past it, so the photograph
 * rests on a surface instead of hovering over the page.
 *
 * **The proof row shouted.** Three facts on a solid gold slab, directly under
 * two buttons, made the eye choose between them and lose. The live state moves
 * up beside the eyebrow, where a status belongs; the facts drop to a ruled
 * credit line at the foot of the column, quiet enough to be read after the
 * headline rather than instead of it.
 *
 * The porchetta card is the one addition. It is the shop's signature — hot, one
 * morning a week — and it used to appear four screens down; as an inset
 * overhanging the plate it is above the fold, gives the composition a second
 * plane, and does the caption's job at the same time.
 */
export default function Hero({ openNow, facts, titolo, testo }: HeroProps) {
  return (
    <section className="relative overflow-hidden px-5 pt-28 pb-14 sm:px-8 sm:pt-32 sm:pb-16 lg:px-12">
      {/* Warmth behind the headline. The hero used to be type on flat white,
          which is why the page read as a document rather than a shopfront: the
          eye had nothing to land on between the words and the photograph. Two
          very soft washes give the corner a light source without becoming a
          gradient anyone would name. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
        style={{
          background:
            "radial-gradient(58% 48% at 12% 6%, rgba(225,190,100,0.16), transparent 70%), radial-gradient(46% 42% at 96% 78%, rgba(164,71,42,0.09), transparent 72%)",
        }}
      />

      {/* The counter the plate sits on.
          Travertine, which is what the marble in an Italian salumeria actually
          is, and the only photograph on this page that is not the shop's own —
          which is precisely why it is a *surface* and not a subject. A stock
          interior would put a stranger's shop under the words "dal 1946"; a
          stone has no shop in it to misattribute.
          One radial mask off the right edge, so the slab has no edge of its own
          on any side: it has to end in the paper, not on it. Only from `lg`,
          where the plate is beside the copy rather than under it and there is a
          right half to be a counter.

          The blend belongs to this wrapper and not to the `<img>` inside it. A
          mask makes an element a stacking context, so `mix-blend-multiply` on
          the image blends it against *this div's* empty backdrop and composites
          to nothing — the stone was in the DOM, correctly sized, and completely
          invisible. On the wrapper the same declaration blends the masked result
          into the page, which is where the paper it has to darken actually is. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-[54%] mix-blend-multiply lg:block"
        style={{
          maskImage:
            "radial-gradient(135% 115% at 112% 46%, #000 32%, rgba(0,0,0,0.72) 58%, transparent 86%)",
          WebkitMaskImage:
            "radial-gradient(135% 115% at 112% 46%, #000 32%, rgba(0,0,0,0.72) 58%, transparent 86%)",
        }}
      >
        <Image
          src="/images/marmo-banco-texture.jpg"
          alt=""
          fill
          sizes="54vw"
          className="object-cover"
          // Travertine photographed on a white sweep is a few percent off the
          // paper it multiplies into, which is a texture nobody can see. The
          // grade is what makes it stone: darker so the veining registers,
          // warmer so it belongs to this palette rather than reading as grey
          // damp on the corner of the page.
          style={{ filter: "brightness(0.9) contrast(1.22) saturate(1.45)" }}
        />
      </div>

      {/* Spine: the shop's own furniture, set in the margin the way a masthead
          runs up the edge of a printed page. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-44 left-4 hidden items-center gap-4 text-[0.625rem] sm:text-[0.5625rem] font-semibold tracking-[0.42em] text-taupe uppercase [writing-mode:vertical-rl] xl:flex"
      >
        <span className="h-14 w-px bg-rule-strong" />
        Ancona · Marche
      </span>

      <div className="mx-auto grid max-w-[88rem] items-center gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6">
          {/* Place and state on one line. The pill used to sit at the end of the
              proof row, four elements below the first thing anyone reads, which
              is late for the one fact that is only true right now. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
              <span aria-hidden className="h-px w-10 bg-gold" />
              Norcineria · Ancona
            </p>

            {openNow !== null && (
              <span
                className={
                  openNow
                    ? "inline-flex items-center gap-2 bg-ok-soft px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-ok-soft-fg uppercase"
                    : "inline-flex items-center gap-2 bg-brown-950/6 px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-taupe uppercase"
                }
              >
                <span
                  aria-hidden
                  className={`size-1.5 rounded-full ${openNow ? "bg-ok" : "bg-tan"}`}
                />
                {openNow ? "Aperto adesso" : "Chiuso adesso"}
              </span>
            )}
          </div>

          <h1 className="font-display display-xl display-fit mt-6 font-semibold text-brown-950">
            {/* One `<span>` per line, always — `RevealLines` animates whatever it
                is handed, and wrapping every line keeps the emphasised one from
                being the only element in the list. */}
            <RevealLines
              immediate
              delay={0.05}
              lines={titolo.map((line, i) => (
                <span key={`t${i}`}>{emphasise(line, `t${i}`)}</span>
              ))}
            />
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-relaxed text-brown-700">{testo}</p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <CTA href="/negozio">Ordina online</CTA>
            <CTA href="/sedi" tone="outline">
              Vieni in bottega
            </CTA>
          </div>

          {/* The facts, as the line of credits under a plate in a magazine:
              hairline above, small caps, gold lozenges between. Everything the
              gold slab said, at the weight the information deserves. */}
          {facts.length > 0 && (
            <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2.5 border-t border-rule pt-5 text-[0.75rem] tracking-[0.02em] text-brown-700">
              {/* The lozenge trails its item rather than leading the next one.
                  Three facts fit one line on a laptop either way, but the row
                  wraps on a phone — and a separator that leads is a separator
                  that starts the second line, where it reads as a bullet the
                  first item never got. Trailing, a wrapped line ends on it,
                  which is how a printed run-on line breaks. */}
              {facts.map((fact, i) => (
                <li key={fact} className="flex items-center gap-6">
                  {fact}
                  {i < facts.length - 1 && (
                    <span aria-hidden className="size-[5px] rotate-45 bg-gold-dark/70" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative lg:col-span-6">
          {/* The plate runs out through the right gutter above `lg`: the negative
              margin is exactly the section's own padding, so the photograph
              stops at the viewport edge and not a pixel past it. Below `lg` it
              stacks under the copy and stays a centred, margined card, because
              a full-bleed picture on a phone leaves the caption nowhere to go. */}
          <div className="relative mx-auto max-w-md lg:mr-[-3rem] lg:max-w-none">
            {/* 4:5 below `lg`, where the photo stacks under the copy and a
                portrait card is the right shape for a phone.

                From `lg` it stops being a ratio and becomes a panel: a height
                the fold can hold, and whatever width the bled column gives it.
                A ratio cannot do both jobs — `aspect-4/5` under a `max-height`
                keeps the ratio by *shrinking the width*, so capping the height
                for short laptop windows was silently pulling the picture back
                off the edge it is supposed to run out through. Height first,
                width from the column, `object-cover` for the crop.

                The photograph is a stock stand-in (Pexels 13728911, Pexels
                License, no attribution required) and the only *subject* on this
                site that is not the shop's own — so it was chosen against one
                hard rule: nothing identifying anyone else. No shopfront, no
                signage, no producer's label, no face. Almost every stock
                salumeria interior fails that test — the good ones are all
                Simoni, Joselito, Zuarina or a named market stall, and putting
                one under "dal 1946" hands the shop's own headline to a
                competitor. Two frames from this very shoot are out for the same
                reason: they have "Roquefort" legible on the foil. Replace it
                with the shop's own crudo and nothing else here has to change. */}
            <ParallaxMedia
              className="aspect-4/5 bg-paper-warm shadow-[0_40px_80px_-48px_rgba(42,26,16,0.55)] lg:aspect-auto lg:h-[min(calc(100dvh_-_12rem),46rem)]"
              distance={56}
            >
              <Image
                src="/images/prosciutto-crudo-tagliere.jpg"
                alt="Un pezzo di prosciutto crudo al taglio su un tagliere di legno, accanto al gorgonzola, alle noci e a fette d'arancia essiccata"
                fill
                preload
                sizes="(max-width: 1024px) 90vw, 46vw"
                className="object-cover"
              />
            </ParallaxMedia>

            {/* The shop's mark, struck across the shoulder of the plate.
                Deliberately half on the paper and half on the photograph: sitting
                wholly inside the frame it reads as a sticker applied to the
                picture, and wholly outside it as a badge floating near one — on
                the seam it reads as sealing the photograph to the page.

                A sibling of <ParallaxMedia/> and not a child, because that
                component clips its own contents to make the drift work; nested,
                the half that overhangs would simply be cut off.

                The overhang has to stay inside the page gutter on a phone. The
                section clips (`overflow-hidden`, for the washes), the plate is
                flush to a 20px gutter at that width, and the mark is the one
                thing on the page that hangs past its own column — so the offsets
                grow with the gutter rather than being one value. The phone step
                is the tightest: the mark is a fixed size while the plate shrinks
                with the screen, so at 320px it is already 37% as wide as the
                photograph and a full-proportion overhang left it 4px off the
                edge of the display. */}
            <SealStamp className="pointer-events-none absolute -top-7 -left-3 z-10 w-25 drop-shadow-[0_10px_22px_rgba(42,26,16,0.16)] sm:-top-8 sm:-left-7 sm:w-32 lg:-top-10 lg:-left-12 lg:w-39" />

            {/* The porchetta, overhanging the plate's lower-left corner.
                It is the one thing the shop is known for and the only offer on
                the page with a deadline in it, so it earns a second plane in the
                composition — and being a picture with a label, it does the
                caption's job too. The old caption said what was at the counter
                today, which is what the day-sheet immediately below the hero is
                for; saying it twice was the reason neither read as news.

                On a phone it stays, and only pulls its overhang in to clear the
                20px gutter — the plate is portrait there and the salumi hang in
                its upper two-thirds, so the lower-left corner is the one part
                of the picture a card can take without covering the subject.
                Dropping it below `sm` would have cost the phone the only view
                of the shop's signature product above the fold, on the device
                most of this shop's visitors arrive with.

                No `.tap` here, and that is not an oversight: the utility sets
                `position: relative` from an unlayered stylesheet, so it beats
                Tailwind's `absolute` and drops the card out of the corner and
                below the photograph — which also stretches the wrapper and
                pushes the whole hero past the fold. It exists to grow targets
                under 44px to 44px, and this card is 210×191. */}
            <Link
              href="/porchetta"
              className="group absolute -bottom-5 -left-2 z-10 block w-[46%] max-w-56 border border-rule bg-paper p-2.5 shadow-[0_24px_50px_-28px_rgba(42,26,16,0.55)] transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none sm:-bottom-6 sm:-left-4 sm:w-[42%] lg:-bottom-10 lg:-left-14"
            >
              <span className="relative block aspect-3/2 overflow-hidden bg-paper-warm">
                <Image
                  src="/images/porchetta-affettata-tagliere.jpg"
                  alt="Porchetta affettata sul tagliere, con rametti di rosmarino"
                  fill
                  sizes="(max-width: 1024px) 40vw, 18vw"
                  className="object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                />
              </span>
              <span className="mt-2.5 block px-1 pb-0.5">
                <span className="block text-[0.625rem] sm:text-[0.5625rem] font-semibold tracking-[0.26em] text-gold-deep uppercase">
                  Ogni sabato
                </span>
                <span className="mt-1 flex items-center gap-2 text-[0.8125rem] leading-snug text-brown-950">
                  Porchetta calda dal forno
                  <ArrowRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-taupe transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-1"
                  />
                </span>
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
