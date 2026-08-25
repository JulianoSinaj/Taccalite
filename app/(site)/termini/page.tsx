import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";
import RichText from "@/components/site/RichText";
import { siteBlocks, siteText } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Condizioni di vendita",
  description:
    "Condizioni generali di vendita di Norcineria Taccalite: prezzi, ordini, pagamenti, consegna, diritto di recesso e garanzia, ai sensi del Codice del Consumo.",
  robots: { index: true, follow: true },
};

/**
 * Conditions of sale — the document distance selling actually requires, and the
 * one the site was missing. Ordering online formed a contract with no published
 * terms and no statement of the right of withdrawal, which for a shop selling
 * mostly perishable goods is the wrong way round: the exceptions in art. 59 are
 * what protect the business, and they only apply if they are disclosed.
 *
 * Same mechanics as /privacy: the text lives in `site_content`
 * (`legal.terms.body`) so a clause can be corrected from Gestionale → Testi del
 * sito without a deploy, and is rendered through `RichText`'s closed grammar
 * rather than as HTML.
 */
export default async function TermsPage() {
  const [blocks, updated] = await Promise.all([
    siteBlocks("legal.terms.body"),
    siteText("legal.terms.updated"),
  ]);
  return (
    <LegalLayout title="Condizioni di vendita" updated={updated}>
      <RichText blocks={blocks ?? []} />
    </LegalLayout>
  );
}
