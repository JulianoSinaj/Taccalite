import Link from "next/link";
import CTA from "@/components/site/CTA";
import NoticeScreen from "@/components/site/NoticeScreen";

/**
 * The 404 for a URL that matches no route at all.
 *
 * A `notFound()` thrown *inside* the storefront renders `app/(site)/not-found.tsx`
 * and keeps the site chrome; this one answers from the root, outside any layout,
 * so it has to bring its own. It carries `.site-shell` for the paper, the grain
 * and Fraunces — without it a mistyped storefront URL landed on the gestionale's
 * cream in the gestionale's typeface — plus a wordmark home, which is the
 * navigation a dead end actually needs.
 *
 * Not the real header: that reads the cart and would drag `CartProvider` and a
 * client boundary onto a page whose whole job is to be a way back.
 */
export default function NotFound() {
  return (
    <div className="site-shell flex flex-1 flex-col">
      <div className="px-5 pt-8 sm:px-8 lg:px-12">
        <Link href="/" className="group inline-flex flex-col leading-none">
          <span className="font-display text-[1.45rem] font-semibold tracking-[-0.04em] text-brown-950 uppercase transition-colors group-hover:text-gold-deep sm:text-[1.6rem]">
            Taccalite
          </span>
          <span className="mt-1 text-[0.5rem] font-semibold tracking-[0.38em] text-taupe uppercase sm:text-[0.5625rem]">
            Norcineria dal 1946
          </span>
        </Link>
      </div>

      <NoticeScreen
        eyebrow="Errore 404"
        ghost="404"
        title={
          <>
            Questa pagina <span className="wonk text-gold-deep">non è al banco.</span>
          </>
        }
        body="Il link che hai seguito non esiste più, o non è mai esistito. Torna alla home, oppure passa dalle nostre due botteghe."
      >
        <CTA href="/">Torna alla home</CTA>
        <CTA href="/sedi" tone="outline">
          Le botteghe
        </CTA>
      </NoticeScreen>
    </div>
  );
}
