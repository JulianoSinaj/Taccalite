import type { Metadata } from "next";
import Link from "next/link";
import LegalLayout from "@/components/LegalLayout";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Informativa sul trattamento dei dati personali di Norcineria Taccalite ai sensi del Regolamento (UE) 2016/679 (GDPR).",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="Informativa sulla privacy" updated="16 luglio 2026">
      <p>
        La presente informativa descrive come {siteConfig.legalName} (&laquo;Titolare&raquo;)
        tratta i dati personali degli utenti che visitano questo sito e utilizzano i suoi
        servizi, ai sensi del Regolamento (UE) 2016/679 (&laquo;GDPR&raquo;).
      </p>

      <h2>1. Titolare del trattamento</h2>
      <p>
        {siteConfig.legalName}, Ancona (Marche), Italia. Per qualsiasi richiesta relativa
        ai tuoi dati puoi scrivere a{" "}
        <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.
      </p>

      <h2>2. Quali dati raccogliamo</h2>
      <ul>
        <li>
          <strong>Dati di prenotazione</strong>: nome, telefono, email (facoltativa), data,
          orario, numero di ospiti, negozio e note che fornisci nel modulo di prenotazione.
        </li>
        <li>
          <strong>Dati dell&apos;account e fedeltà</strong>: nome ed email per la
          registrazione, e i punti fedeltà associati al tuo profilo.
        </li>
        <li>
          <strong>Dati d&apos;ordine</strong>: prodotti selezionati e recapiti necessari
          all&apos;evasione, qualora tu effettui un ordine online.
        </li>
        <li>
          <strong>Newsletter</strong>: l&apos;indirizzo email, se decidi di iscriverti.
        </li>
        <li>
          <strong>Dati tecnici</strong>: cookie strettamente necessari al funzionamento del
          sito (vedi la <Link href="/cookie">cookie policy</Link>).
        </li>
      </ul>

      <h2>3. Finalità e base giuridica</h2>
      <ul>
        <li>
          Gestire prenotazioni, account fedeltà e ordini (esecuzione di un contratto o di
          misure precontrattuali, art. 6.1.b GDPR).
        </li>
        <li>
          Inviare comunicazioni di servizio e, previo consenso, la newsletter (art. 6.1.a).
        </li>
        <li>
          Garantire la sicurezza e il corretto funzionamento del sito (legittimo interesse,
          art. 6.1.f).
        </li>
      </ul>

      <h2>4. Conservazione</h2>
      <p>
        Conserviamo i dati per il tempo strettamente necessario alle finalità indicate e
        secondo gli obblighi di legge. I dati di marketing sono trattati fino alla revoca
        del consenso.
      </p>

      <h2>5. Comunicazione a terzi</h2>
      <p>
        I dati possono essere trattati da fornitori che agiscono come responsabili del
        trattamento (es. servizi di email transazionale e di pagamento), esclusivamente per
        erogare i servizi richiesti. Non vendiamo i tuoi dati.
      </p>

      <h2>6. I tuoi diritti</h2>
      <p>
        Puoi esercitare i diritti di accesso, rettifica, cancellazione, limitazione,
        portabilità e opposizione, oltre a revocare in ogni momento il consenso, scrivendo a{" "}
        <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>. Hai inoltre diritto di
        proporre reclamo al Garante per la protezione dei dati personali.
      </p>

      <p className="text-sm text-brown-800/70">
        Questo documento è un modello di base fornito con la piattaforma e va verificato con
        un consulente legale prima della messa online definitiva.
      </p>
    </LegalLayout>
  );
}
