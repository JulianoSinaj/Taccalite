import type { Metadata } from "next";
import AccountArea from "@/components/AccountArea";

export const metadata: Metadata = {
  title: "Area Personale — Norcineria Taccalite",
  description: "Accedi alla tua area personale Taccalite per consultare la scheda fedeltà.",
};

export default function AccountPage() {
  return <AccountArea />;
}
