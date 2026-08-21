import "server-only";
import { cache } from "react";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { siteContent } from "@/lib/db/schema";
import { siteConfig } from "@/lib/site";

/**
 * Every piece of storefront copy the shop can change without a deploy.
 *
 * The registry lives in code, not in the database, and each entry carries its own
 * **default** — the exact text the page shows today. Three consequences, all
 * deliberate:
 *
 *  - there is no seed step, and no migration that could half-apply: an empty
 *    `site_content` table renders the site precisely as it reads now;
 *  - a key nobody edits stores nothing, so the table only ever holds deltas;
 *  - deleting a row is "reset to the original", which is the undo an owner
 *    actually wants after pasting the wrong thing into a legal page.
 *
 * Four shapes cover everything, because a repeater UI for each different record
 * would be a page builder — and the shop already edits `store.carriers` as
 * pipe-separated lines, so the idiom is one it has met:
 *
 *  - `text`       one line
 *  - `lines`      one item per line
 *  - `rich`       paragraphs, with `## heading`, `- item`, `**bold**`, `[x](/y)`
 *  - `records`    one record per line, fields separated by `|`
 */

export type ContentType = "text" | "lines" | "rich" | "records";

export type ContentDef = {
  key: string;
  label: string;
  help?: string;
  /** Which public page it appears on — how `/admin/contenuti` is grouped. */
  group: string;
  type: ContentType;
  /** Field names for a `records` entry, in the order they are separated by `|`. */
  fields?: string[];
  /** Exactly what the page renders today. */
  default: string;
};

/** One record parsed out of a `records` value. */
export type ContentRecord = Record<string, string>;

const HOME = "Home";
const STORIA = "La nostra storia";
const PORCHETTA = "Porchetta";
const LEGAL = "Note legali";

export const SITE_CONTENT: ContentDef[] = [
  {
    key: "home.hero.facts",
    label: "Home — dati in evidenza",
    help: "Le tre note sotto il titolo della home. Una per riga.",
    group: HOME,
    type: "lines",
    default: ["Dal 1946", "Due botteghe ad Ancona", "Ritiro in giornata"].join("\n"),
  },
  {
    key: "home.servizi",
    label: "Home — i nostri servizi",
    help: "Un servizio per riga: titolo | testo | link | testo del link | colore.",
    group: HOME,
    type: "records",
    fields: ["title", "body", "href", "cta", "accent"],
    default: [
      "Aperitivi | Taglieri di salumi e formaggi composti al momento su quello che c'è di buono quel giorno. Da portare via o da aprire in compagnia. | /negozio | Guarda la selezione | var(--acc-formaggi)",
      "Asporto | Gastronomia pronta, primi e secondi del giorno, olive all'ascolana appena fritte. Ordina la mattina, passi quando ti fa comodo. | /negozio | Ordina online | var(--acc-gastronomia)",
      "Domicilio | Portiamo la spesa a casa ad Ancona e dintorni. Per la consegna in giornata basta chiamare entro mezzogiorno. | /contatti | Chiedi la consegna | var(--acc-carni)",
      "Catering | Compleanni, uffici, feste di famiglia. Prepariamo noi: dal tagliere per otto al buffet completo, concordato voce per voce. | /contatti | Richiedi un preventivo | var(--acc-salumi)",
      "Richieste speciali | Una forma intera, un taglio che non trovi, una porchetta per cinquanta persone. Se esiste ve la troviamo, se serve tempo ve lo diciamo. | /contatti | Scrivici | var(--acc-regalo)",
    ].join("\n"),
  },
  {
    key: "home.porchetta.ricetta",
    label: "Home — la ricetta in breve",
    help: "Un ingrediente per riga: nome | nota.",
    group: HOME,
    type: "records",
    fields: ["name", "note"],
    default: [
      "Rosmarino | a rametti interi",
      "Aglio | in camicia",
      "Finocchietto | selvatico, raccolto qui",
      "Cottura lenta | dalle cinque del mattino",
    ].join("\n"),
  },
  {
    key: "storia.capitoli",
    label: "Storia — i capitoli",
    help: "Un capitolo per riga: etichetta | titolo | testo.",
    group: STORIA,
    type: "records",
    fields: ["marker", "title", "body"],
    default: [
      "1946 | L'inizio | Ad Ancona si riparte. La norcineria è un mestiere che si impara guardando: come si sceglie un capo, come si sala, quanto tempo serve prima che una forma sia pronta. La bottega apre e comincia a farsi un nome sul lavoro, non sull'insegna.",
      "Il mestiere | Quello che non è cambiato | Sono cambiati i frigoriferi, i fornitori, le regole. Non è cambiato il criterio: si assaggia prima noi, si compra da chi conosciamo, e quello che non ci convince non arriva al banco. È l'unica parte della ricetta che non si scrive.",
      "Due banchi | Piazza Kennedy e il Mercato del Piano | Il banco dei formaggi cresce fino a meritarsi una casa sua in Piazza Kennedy, con le stagionature lunghe e i cremosi. Le carni e i salumi restano dove stanno meglio, al Mercato Coperto del Piano, tra chi la spesa la fa ancora tutti i giorni.",
      "Oggi | La terza generazione | Dietro il banco c'è ancora la famiglia, e adesso c'è anche un negozio online: si ordina da casa e si ritira in giornata. Il sabato, come sempre, la porchetta esce calda dal forno e finisce prima di sera.",
    ].join("\n"),
  },
  {
    key: "storia.pilastri",
    label: "Storia — come lavoriamo",
    help: "Un punto per riga: titolo | testo.",
    group: STORIA,
    type: "records",
    fields: ["title", "body"],
    default: [
      "La scelta | Un produttore alla volta. Preferiamo il piccolo caseificio che ci risponde al telefono al catalogo che ci manda il listino.",
      "La lavorazione | Salumi di produzione propria, cotture lente, stagionature che durano quello che devono durare. Il tempo è un ingrediente, non un costo.",
      "Il banco | Tagliamo al momento, spieghiamo cosa state comprando e diciamo anche quando qualcosa non è al meglio. Un consiglio onesto vale più di una vendita.",
    ].join("\n"),
  },
  {
    key: "porchetta.steps",
    label: "Porchetta — come si fa",
    help: "Un passaggio per riga: titolo | testo | immagine | testo alternativo.",
    group: PORCHETTA,
    type: "records",
    fields: ["title", "text", "image", "alt"],
    default: [
      "La selezione | Scegliamo solo carne di suino di alta qualità, lavorata a mano dai nostri norcini. | /images/negozio-carni-prosciutto.jpg | La selezione della carne",
      "L'aromatizzazione | Rosmarino, aglio, finocchietto selvatico e le spezie della ricetta di famiglia, custodita da tre generazioni. | https://images.unsplash.com/photo-1486887396153-fa416526c108?auto=format&fit=crop&q=80&w=800 | La lavorazione artigianale a mano",
      "La cottura lenta | Cotta lentamente in forno, fino a raggiungere la pelle croccante e la carne morbidissima all'interno. | https://images.unsplash.com/photo-1615937657715-bc7b4b7962c1?auto=format&fit=crop&q=80&w=800 | La cottura lenta in forno",
    ].join("\n"),
  },
  {
    key: "porchetta.gallery",
    label: "Porchetta — galleria",
    help: "Un'immagine per riga: percorso | testo alternativo.",
    group: PORCHETTA,
    type: "records",
    fields: ["src", "alt"],
    default: [
      "/images/home-hero-gastronomia.jpg | Il banco gastronomia",
      "/images/negozio-carni-prosciutto.jpg | Il banco carni e salumi",
      "/images/negozio-centro-formaggi.jpg | Il banco formaggi",
      "/images/shop-shelves-prodotti.jpg | Gli scaffali della bottega",
    ].join("\n"),
  },
  {
    key: "legal.privacy.updated",
    label: "Privacy — ultimo aggiornamento",
    group: LEGAL,
    type: "text",
    default: "16 luglio 2026",
  },
  {
    key: "legal.privacy.body",
    label: "Privacy — testo",
    help:
      "Usa «## » per un titolo di sezione, «- » per un elenco, «**testo**» per il grassetto e " +
      "«[testo](/pagina)» per un link. Nient'altro viene interpretato: non è HTML.",
    group: LEGAL,
    type: "rich",
    default: `La presente informativa descrive come {legalName} («Titolare») tratta i dati personali degli utenti che visitano questo sito e utilizzano i suoi servizi, ai sensi del Regolamento (UE) 2016/679 («GDPR»).

## 1. Titolare del trattamento

{legalName}, Ancona (Marche), Italia. Per qualsiasi richiesta relativa ai tuoi dati puoi scrivere a [{email}](mailto:{email}).

## 2. Quali dati raccogliamo

- **Dati di prenotazione**: nome, telefono, email (facoltativa), data, orario, numero di ospiti, negozio e note che fornisci nel modulo di prenotazione.
- **Dati dell'account e fedeltà**: nome ed email per la registrazione, e i punti fedeltà associati al tuo profilo.
- **Dati d'ordine**: prodotti selezionati e recapiti necessari all'evasione, qualora tu effettui un ordine online.
- **Newsletter**: l'indirizzo email, se decidi di iscriverti.
- **Dati tecnici**: cookie strettamente necessari al funzionamento del sito (vedi la [cookie policy](/cookie)).

## 3. Finalità e base giuridica

- Gestire prenotazioni, account fedeltà e ordini (esecuzione di un contratto o di misure precontrattuali, art. 6.1.b GDPR).
- Inviare comunicazioni di servizio e, previo consenso, la newsletter (art. 6.1.a).
- Garantire la sicurezza e il corretto funzionamento del sito (legittimo interesse, art. 6.1.f).

## 4. Conservazione

Conserviamo i dati per il tempo strettamente necessario alle finalità indicate e secondo gli obblighi di legge. I dati di marketing sono trattati fino alla revoca del consenso.

## 5. Comunicazione a terzi

I dati possono essere trattati da fornitori che agiscono come responsabili del trattamento (es. servizi di email transazionale e di pagamento), esclusivamente per erogare i servizi richiesti. Non vendiamo i tuoi dati.

## 6. I tuoi diritti

Puoi esercitare i diritti di accesso, rettifica, cancellazione, limitazione, portabilità e opposizione, oltre a revocare in ogni momento il consenso, scrivendo a [{email}](mailto:{email}). Hai inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali.

Questo documento è un modello di base fornito con la piattaforma e va verificato con un consulente legale prima della messa online definitiva.`,
  },
  {
    key: "legal.cookie.updated",
    label: "Cookie — ultimo aggiornamento",
    group: LEGAL,
    type: "text",
    default: "16 agosto 2026",
  },
  {
    key: "legal.cookie.body",
    label: "Cookie — testo",
    help: "Stesse regole della privacy policy.",
    group: LEGAL,
    type: "rich",
    default: `Questo sito utilizza esclusivamente **cookie tecnici** necessari al suo funzionamento. Non utilizziamo cookie di profilazione né condividiamo dati con terze parti per finalità pubblicitarie.

## Cosa sono i cookie

I cookie sono piccoli file di testo che i siti salvano sul dispositivo dell'utente per memorizzare informazioni utili alla navigazione.

## Cookie che utilizziamo

- **Cookie di sessione**: mantengono l'autenticazione quando accedi all'area personale o all'area di amministrazione. Sono strettamente necessari e non richiedono consenso.
- **Preferenza consenso cookie**: memorizza (nel tuo browser) la scelta effettuata sul banner, per non riproporlo ad ogni visita.

## Cookie di terze parti

Qualora venga attivato il pagamento online, il fornitore di pagamento potrebbe impostare cookie tecnici necessari alla sicurezza della transazione. Nessun cookie di marketing è attivo per impostazione predefinita.

Nella pagina [Le Botteghe](/negozi) è disponibile una mappa fornita da Google Maps. La mappa **non viene caricata automaticamente**: si attiva solo se scegli "Mostra la mappa" (o se hai accettato tutti i cookie dal banner). Al caricamento, Google riceve il tuo indirizzo IP e può impostare propri cookie secondo la [privacy policy di Google](https://policies.google.com/privacy).

## Gestione dei cookie

Puoi eliminare o bloccare i cookie dalle impostazioni del tuo browser. La disattivazione dei cookie tecnici potrebbe compromettere alcune funzionalità del sito.

Per maggiori informazioni sul trattamento dei dati consulta la [privacy policy](/privacy) o scrivi a [{email}](mailto:{email}).`,
  },
];

const BY_KEY = new Map(SITE_CONTENT.map((d) => [d.key, d]));

/** The groups, in the order `/admin/contenuti` shows them. */
export const CONTENT_GROUPS = [...new Set(SITE_CONTENT.map((d) => d.group))];

/**
 * Raw stored values for a set of keys. Anything unset is simply absent, so the
 * caller falls back to the registry default.
 */
export const getStoredContent = cache(async (keys: string[]): Promise<Map<string, string>> => {
  if (keys.length === 0) return new Map();
  const rows = await db
    .select()
    .from(siteContent)
    .where(inArray(siteContent.key, keys));
  const out = new Map<string, string>();
  for (const r of rows) {
    if (typeof r.value === "string" && r.value.trim() !== "") out.set(r.key, r.value);
  }
  return out;
});

/**
 * `{legalName}` and `{email}` in the copy resolve to the site's own identity, so
 * a change of registered name or contact address does not have to be chased
 * through six paragraphs of a privacy policy. Substituted at read time and left
 * verbatim in the editor, where the placeholder is the point.
 */
export function applyTokens(raw: string): string {
  return raw
    .replaceAll("{legalName}", siteConfig.legalName)
    .replaceAll("{email}", siteConfig.email);
}

/** The raw text for one key: what the shop stored, or the built-in default. */
export async function contentText(key: string): Promise<string> {
  const def = BY_KEY.get(key);
  const stored = await getStoredContent([key]);
  return applyTokens(stored.get(key) ?? def?.default ?? "");
}

/** The stored text exactly as typed — what the editor must show. */
export async function contentRaw(key: string): Promise<string> {
  const def = BY_KEY.get(key);
  const stored = await getStoredContent([key]);
  return stored.get(key) ?? def?.default ?? "";
}

/** Non-empty lines. */
export function parseLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Pipe-separated records, one per line.
 *
 * A row with fewer fields than declared keeps the missing ones empty rather than
 * being dropped: a half-typed line should render as a half-filled card the owner
 * can see and finish, not vanish silently.
 */
export function parseRecords(raw: string, fields: string[]): ContentRecord[] {
  return parseLines(raw).map((line) => {
    const parts = line.split("|").map((p) => p.trim());
    const rec: ContentRecord = {};
    fields.forEach((f, i) => (rec[f] = parts[i] ?? ""));
    return rec;
  });
}

/** Paragraph blocks, split on blank lines (the shape `RichText` renders). */
export function parseBlocks(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/** One line of copy. */
export async function siteText(key: string): Promise<string> {
  return (await contentText(key)).trim();
}

/** A list of lines. */
export async function siteLines(key: string): Promise<string[]> {
  return parseLines(await contentText(key));
}

/** A list of records, using the field names declared in the registry. */
export async function siteRecords(key: string): Promise<ContentRecord[]> {
  const def = BY_KEY.get(key);
  return parseRecords(await contentText(key), def?.fields ?? []);
}

/**
 * Paragraph blocks for `RichText`, or null when nothing is stored and the entry
 * has no default — which is how a page keeps its own hand-written JSX until
 * somebody actually decides to override it.
 */
export async function siteBlocks(key: string): Promise<string[] | null> {
  const raw = (await contentText(key)).trim();
  return raw ? parseBlocks(raw) : null;
}

export function contentDef(key: string): ContentDef | undefined {
  return BY_KEY.get(key);
}
