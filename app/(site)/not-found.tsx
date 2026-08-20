import CTA from "@/components/site/CTA";
import NoticeScreen from "@/components/site/NoticeScreen";

/**
 * The storefront's own 404, so a dead link under `app/(site)` keeps the site
 * chrome and the paper ground instead of falling through to the root boundary.
 */
export default function SiteNotFound() {
  return (
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
  );
}
