import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";
import RichText from "@/components/site/RichText";
import { siteBlocks, siteText } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Informativa sul trattamento dei dati personali di Norcineria Taccalite ai sensi del Regolamento (UE) 2016/679 (GDPR).",
  robots: { index: true, follow: true },
};

/**
 * The text now lives in `site_content` (`legal.privacy.body`), with the previous
 * JSX as the default, so a clause can be corrected without a deploy — which for
 * a legal document is the difference between "we should update that" and "we
 * updated that".
 *
 * It is *not* rendered as HTML. `RichText` parses a closed grammar into React
 * elements, so the headings and links survive while a form field can never
 * inject markup. Making a privacy policy freely editable HTML would be a strange
 * place to open that door.
 */
export default async function PrivacyPage() {
  const [blocks, updated] = await Promise.all([
    siteBlocks("legal.privacy.body"),
    siteText("legal.privacy.updated"),
  ]);
  return (
    <LegalLayout title="Informativa sulla privacy" updated={updated}>
      <RichText blocks={blocks ?? []} />
    </LegalLayout>
  );
}
