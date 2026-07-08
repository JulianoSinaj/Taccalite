import type { Metadata } from "next";
import SectionHeading from "@/components/SectionHeading";
import ReservationForm from "@/components/ReservationForm";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Prenota un Tavolo — Norcineria Taccalite",
  description: "Prenota un tavolo o la tua porchetta in uno dei negozi Taccalite ad Ancona.",
};

export default function PrenotazioniPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <Reveal>
        <SectionHeading
          eyebrow="Prenotazioni"
          title="Prenota un tavolo"
          description="Compila il modulo per prenotare un tavolo o richiedere la tua porchetta. Ti ricontatteremo per confermare la disponibilità."
        />
      </Reveal>
      <Reveal delay={0.1} className="mt-10">
        <ReservationForm />
      </Reveal>
    </div>
  );
}
