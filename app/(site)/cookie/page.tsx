import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";
import RichText from "@/components/site/RichText";
import { siteBlocks, siteText } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Informativa sull'uso dei cookie del sito Norcineria Taccalite: solo cookie tecnici necessari al funzionamento.",
  robots: { index: true, follow: true },
};

/** Editable in the gestionale (`legal.cookie.body`); see the privacy page for
 *  why the text is parsed rather than treated as HTML. */
export default async function CookiePage() {
  const [blocks, updated] = await Promise.all([
    siteBlocks("legal.cookie.body"),
    siteText("legal.cookie.updated"),
  ]);
  return (
    <LegalLayout title="Cookie Policy" updated={updated}>
      <RichText blocks={blocks ?? []} />
    </LegalLayout>
  );
}
