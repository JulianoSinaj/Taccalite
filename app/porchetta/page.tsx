import type { Metadata } from "next";
import Link from "next/link";
import Hero from "@/components/Hero";
import ImagePlaceholder from "@/components/ImagePlaceholder";
import SectionHeading from "@/components/SectionHeading";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "La Porchetta — Norcineria Taccalite",
  description: "La porchetta artigianale Taccalite: la ricetta di famiglia, cotta lentamente ogni sabato ad Ancona.",
};

const steps = [
  {
    title: "La selezione",
    text: "Scegliamo solo carne di suino di alta qualità, lavorata a mano dai nostri norcini.",
  },
  {
    title: "L'aromatizzazione",
    text: "Rosmarino, aglio, finocchietto selvatico e le spezie della ricetta di famiglia, custodita da tre generazioni.",
  },
  {
    title: "La cottura lenta",
    text: "Cotta lentamente in forno, fino a raggiungere la pelle croccante e la carne morbidissima all'interno.",
  },
];

export default function PorchettaPage() {
  return (
    <div>
      <Hero
        eyebrow="La specialità della casa"
        title="La nostra porchetta"
        description="Una ricetta che si tramanda in famiglia dal 1946: pelle croccante, carne morbida e le erbe aromatiche delle Marche. È il prodotto che ci rappresenta di più."
        imageLabel="Foto porchetta intera appena sfornata"
        primaryCta={{ href: "/prenotazioni", label: "Prenota la tua porchetta" }}
      />

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <Reveal>
          <SectionHeading
            eyebrow="Dalla scelta della carne al taglio finale"
            title="Come nasce la nostra porchetta"
          />
        </Reveal>
        <RevealStagger className="mt-10 grid gap-6 sm:grid-cols-3">
          {steps.map((step, i) => (
            <RevealStaggerItem
              key={step.title}
              className="rounded-2xl border border-brown-700/15 bg-white/50 p-6"
            >
              <div className="font-display text-3xl font-semibold text-gold-dark">
                {String(i + 1).padStart(2, "0")}
              </div>
              <h3 className="font-display mt-3 text-xl font-semibold text-brown-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-brown-800/70">{step.text}</p>
            </RevealStaggerItem>
          ))}
        </RevealStagger>
      </section>

      <section className="bg-brown-900">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:items-center">
          <Reveal y={0}>
            <ImagePlaceholder label="Foto porchetta affettata sul tagliere" ratio="wide" className="border-cream/10" />
          </Reveal>
          <Reveal delay={0.1}>
            <SectionHeading
              eyebrow="Ogni sabato"
              title="L'appuntamento del sabato mattina"
              description="Ogni sabato la porchetta esce calda dal forno in Piazza Kennedy. Per essere sicuri di trovarla, potete prenotarla in anticipo direttamente in negozio o per telefono."
              light
            />
            <Link
              href="/negozi/centro"
              data-magnetic
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-semibold text-brown-950 hover:bg-cream"
            >
              Vieni a trovarci in Piazza Kennedy
              <span aria-hidden>→</span>
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
