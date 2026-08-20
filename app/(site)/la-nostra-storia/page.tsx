import type { Metadata } from "next";
import Image from "next/image";
import CTA from "@/components/site/CTA";
import Reveal from "@/components/Reveal";
import RevealLines from "@/components/site/RevealLines";
import { getShops } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "La nostra storia",
  description:
    "Norcineria Taccalite: dal 1946 ad Ancona, tre generazioni dietro lo stesso banco. Come scegliamo, come lavoriamo e perché le botteghe sono due.",
  alternates: { canonical: "/la-nostra-storia" },
};

/**
 * Written only from what the shop has actually told us: the founding year, the
 * family running it, the two locations and their specialities, and the Saturday
 * porchetta. No invented milestones, no invented names — a history page for a
 * real business is the last place to fill gaps with plausible fiction. The
 * `capitoli` below are eras rather than dates for exactly that reason; when the
 * family supplies the real years, they slot straight in.
 */
const capitoli = [
  {
    marker: "1946",
    title: "L'inizio",
    body: "Ad Ancona si riparte. La norcineria è un mestiere che si impara guardando: come si sceglie un capo, come si sala, quanto tempo serve prima che una forma sia pronta. La bottega apre e comincia a farsi un nome sul lavoro, non sull'insegna.",
  },
  {
    marker: "Il mestiere",
    title: "Quello che non è cambiato",
    body: "Sono cambiati i frigoriferi, i fornitori, le regole. Non è cambiato il criterio: si assaggia prima noi, si compra da chi conosciamo, e quello che non ci convince non arriva al banco. È l'unica parte della ricetta che non si scrive.",
  },
  {
    marker: "Due banchi",
    title: "Piazza Kennedy e il Mercato del Piano",
    body: "Il banco dei formaggi cresce fino a meritarsi una casa sua in Piazza Kennedy, con le stagionature lunghe e i cremosi. Le carni e i salumi restano dove stanno meglio, al Mercato Coperto del Piano, tra chi la spesa la fa ancora tutti i giorni.",
  },
  {
    marker: "Oggi",
    title: "La terza generazione",
    body: "Dietro il banco c'è ancora la famiglia, e adesso c'è anche un negozio online: si ordina da casa e si ritira in giornata. Il sabato, come sempre, la porchetta esce calda dal forno e finisce prima di sera.",
  },
];

const pilastri = [
  {
    title: "La scelta",
    body: "Un produttore alla volta. Preferiamo il piccolo caseificio che ci risponde al telefono al catalogo che ci manda il listino.",
  },
  {
    title: "La lavorazione",
    body: "Salumi di produzione propria, cotture lente, stagionature che durano quello che devono durare. Il tempo è un ingrediente, non un costo.",
  },
  {
    title: "Il banco",
    body: "Tagliamo al momento, spieghiamo cosa state comprando e diciamo anche quando qualcosa non è al meglio. Un consiglio onesto vale più di una vendita.",
  },
];

export default async function StoriaPage() {
  const shops = await getShops();

  return (
    <>
      <section className="px-5 pt-32 pb-16 sm:px-8 sm:pt-40 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-10 bg-gold" />
            La nostra storia
          </p>
          <h1 className="font-display display-xl mt-8 max-w-4xl font-semibold text-brown-950">
            <RevealLines
              immediate
              lines={[
                "Ottant'anni",
                <span key="2">
                  dietro lo <span className="wonk text-gold-deep">stesso banco.</span>
                </span>,
              ]}
            />
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-brown-700">
            Abbiamo aperto nel 1946 e da allora facciamo la stessa cosa: scegliere bene,
            lavorare con calma e dirlo in faccia a chi compra. Questa è la parte di
            storia che vale la pena raccontare.
          </p>
        </div>
      </section>

      <section className="px-5 sm:px-8 lg:px-12">
        <div className="relative mx-auto max-w-[88rem]">
          <div className="relative aspect-[16/9] overflow-hidden bg-paper-warm">
            <Image
              src="/images/home-hero-gastronomia.jpg"
              alt="Il banco della gastronomia Taccalite, pieno di preparazioni pronte"
              fill
              preload
              sizes="100vw"
              className="object-cover"
            />
          </div>
          <p className="mt-4 text-[0.8125rem] text-taupe">
            Il banco, un giorno qualunque di bottega.
          </p>
        </div>
      </section>

      <section className="bg-paper px-5 py-16 sm:px-8 sm:py-32 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <h2 className="font-display display-lg max-w-2xl font-semibold text-brown-950">
            Come ci siamo <span className="wonk text-gold-deep">arrivati</span>
          </h2>

          <ol className="mt-16 border-t border-rule">
            {capitoli.map((capitolo, i) => (
              <Reveal key={capitolo.marker} delay={i * 0.05}>
                <li className="grid gap-x-10 gap-y-4 border-b border-rule py-11 md:grid-cols-[10rem_1fr] lg:grid-cols-[14rem_1fr]">
                  <p className="font-display text-[1.375rem] leading-none font-semibold tracking-[-0.02em] text-gold-deep">
                    {capitolo.marker}
                  </p>
                  <div className="max-w-2xl">
                    <h3 className="font-display text-[1.5rem] leading-snug font-semibold tracking-[-0.02em] text-brown-950 md:text-[1.75rem]">
                      {capitolo.title}
                    </h3>
                    <p className="mt-4 text-lg leading-relaxed text-brown-700">
                      {capitolo.body}
                    </p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-paper-warm px-5 py-16 sm:px-8 sm:py-32 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-10 bg-gold" />
            Il mestiere
          </p>
          <h2 className="font-display display-lg mt-7 max-w-2xl font-semibold text-brown-950">
            Tre cose su cui <span className="wonk text-gold-deep">non transigiamo</span>
          </h2>

          <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-3">
            {pilastri.map((pilastro, i) => (
              <Reveal key={pilastro.title} delay={i * 0.07}>
                <div className="border-t border-gold/45 pt-7">
                  <h3 className="font-display text-[1.5rem] leading-none font-semibold tracking-[-0.025em] text-brown-950">
                    {pilastro.title}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-brown-700">
                    {pilastro.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-brown-950 px-5 py-16 sm:px-8 sm:py-32 lg:px-12">
        <div aria-hidden className="bg-noise absolute inset-0 opacity-[0.07]" />
        <div
          aria-hidden
          className="parallax-orb absolute -bottom-64 -left-52 h-[44rem] w-[44rem] opacity-[0.13]"
        />
        <div className="relative mx-auto max-w-[88rem]">
          <blockquote className="max-w-3xl">
            <p className="font-display display-lg font-semibold text-cream">
              «Se non lo porteremmo a casa nostra,{" "}
              <span className="wonk text-gold">non lo mettiamo al banco.»</span>
            </p>
          </blockquote>

          <div className="mt-14 grid gap-10 border-t border-cream/12 pt-10 md:grid-cols-2">
            {shops.map((shop) => (
              <div key={shop.slug}>
                <h3 className="font-display text-[1.5rem] leading-none font-semibold tracking-[-0.025em] text-cream">
                  {shop.name}
                </h3>
                <p className="mt-2 text-[0.625rem] font-semibold tracking-[0.22em] text-gold uppercase">
                  {shop.specialty}
                </p>
                <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-cream/65">
                  {shop.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-14 flex flex-wrap items-center gap-3">
            <CTA href="/sedi" tone="gold">
              Vieni a trovarci
            </CTA>
            <CTA href="/negozio" tone="onDark">
              Ordina online
            </CTA>
          </div>
        </div>
      </section>
    </>
  );
}
