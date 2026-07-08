import type { Metadata } from "next";
import SectionHeading from "@/components/SectionHeading";
import AccountArea from "@/components/AccountArea";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Area Personale — Norcineria Taccalite",
  description: "Accedi alla tua area personale Taccalite per consultare la scheda fedeltà.",
};

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8 sm:py-24">
      <Reveal>
        <SectionHeading
          eyebrow="Il tuo account"
          title="Area personale"
          description="Accedi per consultare la tua scheda fedeltà e i vantaggi riservati ai clienti Taccalite."
        />
      </Reveal>
      <Reveal delay={0.1} className="mt-10">
        <AccountArea />
      </Reveal>
    </div>
  );
}
