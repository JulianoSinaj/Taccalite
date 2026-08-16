import type { Metadata } from "next";
import Link from "next/link";
import LegalLayout from "@/components/LegalLayout";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Informativa sull'uso dei cookie del sito Norcineria Taccalite: solo cookie tecnici necessari al funzionamento.",
  robots: { index: true, follow: true },
};

export default function CookiePage() {
  return (
    <LegalLayout title="Cookie Policy" updated="16 agosto 2026">
      <p>
        Questo sito utilizza esclusivamente <strong>cookie tecnici</strong> necessari al suo
        funzionamento. Non utilizziamo cookie di profilazione né condividiamo dati con terze
        parti per finalità pubblicitarie.
      </p>

      <h2>Cosa sono i cookie</h2>
      <p>
        I cookie sono piccoli file di testo che i siti salvano sul dispositivo dell&apos;utente
        per memorizzare informazioni utili alla navigazione.
      </p>

      <h2>Cookie che utilizziamo</h2>
      <ul>
        <li>
          <strong>Cookie di sessione</strong>: mantengono l&apos;autenticazione quando accedi
          all&apos;area personale o all&apos;area di amministrazione. Sono strettamente
          necessari e non richiedono consenso.
        </li>
        <li>
          <strong>Preferenza consenso cookie</strong>: memorizza (nel tuo browser) la scelta
          effettuata sul banner, per non riproporlo ad ogni visita.
        </li>
      </ul>

      <h2>Cookie di terze parti</h2>
      <p>
        Qualora venga attivato il pagamento online, il fornitore di pagamento potrebbe
        impostare cookie tecnici necessari alla sicurezza della transazione. Nessun cookie di
        marketing è attivo per impostazione predefinita.
      </p>
      <p>
        Nella pagina <Link href="/negozi">Le Botteghe</Link> è disponibile una mappa fornita da
        Google Maps. La mappa <strong>non viene caricata automaticamente</strong>: si attiva solo
        se scegli &ldquo;Mostra la mappa&rdquo; (o se hai accettato tutti i cookie dal banner). Al
        caricamento, Google riceve il tuo indirizzo IP e può impostare propri cookie secondo la{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
          privacy policy di Google
        </a>
        .
      </p>

      <h2>Gestione dei cookie</h2>
      <p>
        Puoi eliminare o bloccare i cookie dalle impostazioni del tuo browser. La
        disattivazione dei cookie tecnici potrebbe compromettere alcune funzionalità del sito.
      </p>

      <p>
        Per maggiori informazioni sul trattamento dei dati consulta la{" "}
        <Link href="/privacy">privacy policy</Link> o scrivi a{" "}
        <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.
      </p>
    </LegalLayout>
  );
}
