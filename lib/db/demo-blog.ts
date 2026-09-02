/**
 * The demo diary: fourteen fixture posts, shaped like real articles.
 *
 * Split out of `scripts/seed-demo.ts` so it can be re-applied on its own.
 * The demo seeder inserts with `onConflictDoNothing` and its other tables are
 * appended to unconditionally, so re-running it to pick up a change to the
 * posts would duplicate four hundred audit rows to fix fourteen articles;
 * `scripts/refresh-blog.ts --demo` uses this module to update the posts in
 * place instead, leaving orders, customers and the draft/published mix alone.
 *
 * Pure data plus one builder — no database, no side effects on import (the
 * seeder runs `main()` at module scope, which is why importing *from* it is not
 * an option).
 *
 * These are still fixtures and still read as such. What they are not any more
 * is fourteen copies of the same three sentences with no photograph: each has
 * an opening, a section, a list, a pull quote and a real image from
 * `public/images`, and the fourteen rotate through the four templates in
 * `lib/blog-article.ts` so a demo database exercises all of them.
 */
import { slugify } from "../slug-core";

type DemoArticle = {
  image: string;
  caption: string;
  opening: string;
  section: string;
  body: string;
  list: string[];
  quote: string;
};

/**
 * The prose, one set per category rather than fourteen written by hand: enough
 * variation that a page of cards does not repeat itself, and honest about being
 * filler.
 */
const DEMO_ARTICLES: Record<string, DemoArticle> = {
  Storie: {
    image: "/images/salumi-appesi-stagionatura.jpg",
    caption: "I pezzi appesi dietro al banco, ognuno con il suo cartellino",
    opening:
      "Certe cose in bottega si raccontano meglio stando fermi a guardarle. Questa è una di quelle: comincia molto prima di arrivare al banco e finisce parecchio dopo.",
    section: "Come è cominciata",
    body: "Non c'è una data precisa, c'è un'abitudine che si è consolidata. Si è cominciato perché serviva, si è continuato perché funzionava, e a un certo punto è diventato il modo in cui si fa qui.",
    list: [
      "Il tempo è l'ingrediente che costa di più e che non si vede in vetrina.",
      "Quello che si fa a mano si riconosce anche senza saperlo spiegare.",
      "Ogni pezzo ha una storia corta: da dove viene e chi lo ha seguito.",
    ],
    quote: "Le cose fatte in fretta si vedono. Anche quando nessuno guarda.",
  },
  Bottega: {
    image: "/images/salumi-appesi-bottega-alt.jpg",
    caption: "Il banco visto da sotto, con i salumi di casa appesi",
    opening:
      "In negozio le giornate si somigliano solo da fuori. Dentro cambiano con la stagione, con quello che arriva la mattina e con chi entra dalla porta.",
    section: "Come funziona al banco",
    body: "La regola non scritta è una sola: chiedete. Il pezzo giusto è quasi sempre quello pronto oggi, e non è detto che sia quello che avevate in mente entrando.",
    list: [
      "Dite per quante persone: sul resto vi consigliamo noi.",
      "Se serve per la sera, si può mettere da parte con una telefonata.",
      "Gli ordini grandi vogliono qualche giorno di preavviso.",
    ],
    quote: "Il banco è un posto dove si parla. È metà del mestiere.",
  },
  Ricette: {
    image: "/images/gastronomia-preparati-freschi.jpg",
    caption: "La gastronomia pronta del giorno, nelle teglie del banco",
    opening:
      "È una di quelle ricette che ognuno fa a modo suo e nessuno fa uguale. Questa è la versione della bottega, con le proporzioni che usiamo davvero.",
    section: "Quello che serve",
    body: "Gli ingredienti sono pochi e per questo vanno scelti bene: è il caso in cui la spesa conta più della tecnica.",
    list: [
      "Prendete la materia prima al banco il giorno stesso.",
      "Non abbiate fretta sulla cottura: è lì che si perde tutto.",
      "Assaggiate prima di correggere di sale, sempre.",
    ],
    quote: "Una ricetta di casa non è una formula. È una direzione.",
  },
  Tecnica: {
    image: "/images/paolo-taccalite-ritratto.jpg",
    caption: "Il taglio a mano, davanti alle forme di formaggio",
    opening:
      "Sembra un dettaglio e non lo è: il modo in cui una cosa viene tagliata, conservata o servita cambia il sapore più di quanto cambi la materia prima.",
    section: "Il gesto giusto",
    body: "Si impara guardando, e si sbaglia finché non si capisce cosa si sta cercando. Poi diventa automatico e non ci si pensa più.",
    list: [
      "Il coltello affilato taglia; quello smussato schiaccia.",
      "Lo spessore della fetta cambia il sapore, non solo la porzione.",
      "Il freddo secco è il nemico numero uno di quasi tutto.",
    ],
    quote: "La differenza fra tagliare e affettare la senti in bocca, non nel piatto.",
  },
  Territorio: {
    image: "/images/lonza-suino-brado.jpg",
    caption: "Un pezzo di lonza, come arriva dall'allevamento",
    opening:
      "Le Marche stanno in mezzo: fra la montagna e il mare ci sono trenta chilometri, e in quei trenta chilometri cambiano il pascolo, il clima e il modo di lavorare.",
    section: "Chi c'è dietro",
    body: "Dietro ogni prodotto del banco c'è qualcuno che lo fa, e quasi sempre è a poche ore di macchina. Andarli a trovare fa parte del lavoro.",
    list: [
      "Allevamenti piccoli, dove gli animali si contano ancora a uno a uno.",
      "Filiere corte: meno passaggi, meno cose che si perdono per strada.",
      "Rapporti lunghi, perché la costanza si giudica sugli anni.",
    ],
    quote: "Non compriamo un prodotto. Compriamo il modo in cui qualcuno lavora.",
  },
  Cantina: {
    image: "/images/bottega-angolo-aperitivo.jpg",
    caption: "L'angolo dei vini, con le forme sugli scaffali alti",
    opening:
      "Un abbinamento riuscito non è una regola rispettata: è quando due cose messe insieme sanno più di quanto sapessero da sole.",
    section: "Come ragioniamo",
    body: "Grasso vuole acidità, sapido vuole dolcezza, stagionato vuole struttura. Sono tre indicazioni, non tre leggi — e si smentiscono volentieri assaggiando.",
    list: [
      "Il tannino con i salumi grassi fa a pugni più spesso di quanto si creda.",
      "Le bollicine puliscono la bocca: con il fritto non sbagliano mai.",
      "Il vino di casa con il salume di casa funziona per un motivo.",
    ],
    quote: "Il miglior abbinamento è quello che vi fa venire voglia del boccone dopo.",
  },
  Formaggi: {
    image: "/images/tagliere-formaggi-salumi.jpg",
    caption: "Formaggi al taglio e crudo affettato sullo stesso tagliere",
    opening:
      "Al banco dei formaggi le domande sono sempre le stesse tre, e sono tre domande giuste: quanto è stagionato, di che latte è, e con cosa ci sta bene.",
    section: "Come sceglierlo",
    body: "La crosta racconta quasi tutto: colore, umidità e odore dicono a che punto è la forma prima ancora di tagliarla.",
    list: [
      "Chiedete di assaggiare: per le paste molli è l'unico modo serio.",
      "Comprate poco e spesso, non molto e una volta sola.",
      "Fuori dal frigo mezz'ora prima di servire, senza eccezioni.",
    ],
    quote: "Una forma la compri due volte: quando l'assaggi e quando la tagli.",
  },
};

const DEMO_LAYOUTS = ["editoriale", "rivista", "avviso", "galleria"] as const;


/** The demo headlines, and the category each is filed under. */
export const DEMO_BLOG_TITLES: [title: string, category: string][] = [
  ["La stagionatura del ciauscolo, mese per mese", "Storie"],
  ["Perché la porchetta si prenota entro il venerdì", "Bottega"],
  ["Vincisgrassi: la ricetta di nonna Elide", "Ricette"],
  ["Come tagliare il prosciutto a coltello", "Tecnica"],
  ["Il maiale marchigiano e i suoi allevatori", "Territorio"],
  ["Abbinare il Rosso Conero ai salumi stagionati", "Cantina"],
  ["Cosa cambia tra Casciotta e Caciotta", "Formaggi"],
  ["Il nostro Natale in bottega: cesti e prenotazioni", "Bottega"],
  ["Olive all'ascolana: friggerle come si deve", "Ricette"],
  ["Tre modi di usare il guanciale (che non sono la carbonara)", "Ricette"],
  ["Visita al Caseificio Esino", "Territorio"],
  ["Sottovuoto o carta: come conservare i salumi", "Tecnica"],
  ["Il banco dei formaggi si rinnova", "Bottega"],
  ["Pasqua 2026: agnello e crescia", "Bottega"],
];


/**
 * One demo post, ready to insert or to update in place.
 *
 * `date`, `createdAt` and the draft/published split stay with the caller: they
 * come from the seeder's PRNG, and a refresh must not reshuffle the dates of a
 * demo shop somebody is looking at.
 */
export function demoBlogPost(index: number) {
  const [title, category] = DEMO_BLOG_TITLES[index];
  const a = DEMO_ARTICLES[category] ?? DEMO_ARTICLES.Bottega;
  return {
    slug: `demo-${slugify(title)}`.slice(0, 80),
    title,
    category,
    excerpt: `${a.opening.split(".")[0]}. Appunti dalla norcineria.`,
    // One entry per block, in the grammar `lib/blog-article.ts` parses.
    content: [
      a.opening,
      `${title}: quello che facciamo ogni giorno, spiegato come lo spiegheremmo al banco — senza scorciatoie e senza parole difficili.`,
      `## ${a.section}`,
      a.body,
      `![${a.caption}](${a.image})`,
      `> ${a.quote}`,
      "## In pratica",
      ...a.list.map((item) => `- ${item}`),
      "| Dove | In bottega, al banco",
      "| Quando | Tutti i giorni, domenica esclusa",
      "Passa a trovarci e assaggia: è ancora il modo migliore per capirlo.",
    ],
    layout: DEMO_LAYOUTS[index % DEMO_LAYOUTS.length],
    imageLabel: a.caption,
    image: a.image,
  };
}
