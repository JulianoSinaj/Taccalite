export type Shop = {
  slug: string;
  name: string;
  specialty: string;
  tagline: string;
  description: string;
  address: string;
  hours: { label: string; value: string }[];
  hoursConfirmed: boolean;
  phone: string;
  email: string;
  highlights: string[];
  imageLabel: string;
  image: string;
};

export const shops: Shop[] = [
  {
    slug: "centro",
    name: "Taccalite Centro",
    specialty: "Formaggi",
    tagline: "La casa dei grandi formaggi, nel cuore di Ancona",
    description:
      "Il negozio di Piazza Kennedy, nel centro di Ancona. Qui la selezione è dedicata alle forme più pregiate: pecorini di fossa, formaggi cremosi come gorgonzola e taleggio, stagionature lunghe e specialità da tutta Italia, scelte una a una dal nostro banco.",
    address: "Piazza Kennedy, 10 — Ancona",
    hours: [
      { label: "Lun – Sab", value: "9:00 – 20:00 (orario continuato)" },
      { label: "Domenica", value: "Chiuso" },
    ],
    hoursConfirmed: true,
    phone: "071 663 5605",
    email: "norcineriataccalitepaolo@gmail.com",
    highlights: [
      "Formaggi cremosi selezionati: gorgonzola, taleggio, roquefort, nuvola di capra",
      "Formaggio di fossa e stagionature lunghe",
      "Gastronomia pronta e degustazioni in negozio",
    ],
    // Was `tagliere-formaggi.jpg`, a Wikimedia photo standing in under CC
    // BY-SA 4.0. This is our own board, so the credit it required is gone from
    // `PhotoCredit` along with it — which is the whole point of keying credits
    // off the `src`.
    imageLabel: "Formaggi al taglio sul tagliere di legno, accanto ai salumi affettati",
    image: "/images/tagliere-formaggi-verticale.jpg",
  },
  {
    slug: "carni",
    name: "Taccalite Mercato del Piano",
    specialty: "Carni & Salumi",
    tagline: "Le migliori carni e i salumi della tradizione marchigiana",
    description:
      "Il secondo negozio di famiglia, al Mercato Coperto del Piano. Qui trovate carni selezionate, salumi artigianali come il prosciutto di Norcia e i tagli pronti per la brace, lavorati con la stessa cura di sempre.",
    address: "Piazza d'Armi, 59 — Ancona",
    hours: [
      { label: "Lun – Sab", value: "Orari da confermare in negozio" },
      { label: "Domenica", value: "Chiuso" },
    ],
    hoursConfirmed: false,
    phone: "071 897903",
    email: "norcineriataccalitepaolo@gmail.com",
    highlights: [
      "Bistecche e tagli di razza marchigiana",
      "Salumi artigianali di produzione propria",
      "Preparazioni pronte per grigliata e brace",
    ],
    imageLabel: "Salumi appesi in stagionatura al Mercato del Piano",
    image: "/images/salumi-appesi-stagionatura.jpg",
  },
];

export type Product = {
  slug: string;
  name: string;
  shopSlug: string;
  category: string;
  description: string;
  imageLabel: string;
  image: string;
};

export const featuredProducts: Product[] = [
  {
    slug: "porchetta-artigianale",
    name: "Porchetta artigianale",
    shopSlug: "carni",
    category: "Specialità della casa",
    description:
      "La nostra porchetta, cotta lentamente secondo la ricetta di famiglia: pelle croccante e carne morbida, aromatizzata con le erbe delle Marche.",
    imageLabel: "Le teglie pronte per il forno, condite con le erbe di casa",
    image: "/images/gastronomia-teglie-forno.jpg",
  },
  {
    slug: "ciauscolo-igp",
    name: "Ciauscolo IGP",
    shopSlug: "carni",
    category: "Salumi",
    description:
      "Il salame morbido e spalmabile tipico marchigiano, prodotto secondo la tradizione norcina di famiglia.",
    imageLabel: "Ciauscolo e salumi di produzione propria appesi in bottega",
    image: "/images/salumi-appesi-bottega.jpg",
  },
  {
    slug: "pecorino-di-fossa",
    name: "Pecorino di fossa",
    shopSlug: "centro",
    category: "Formaggi",
    description:
      "Stagionato in fossa secondo il metodo tradizionale marchigiano, dal profumo intenso e dal gusto deciso.",
    // No photograph of our own pecorino yet. An empty `image` is the honest
    // answer: `ProductTile` falls back to the typographic plate, which reads as
    // a printed-catalogue device rather than a hole — and beats the hotlinked
    // Unsplash wheel that used to sit here passing for ours.
    imageLabel: "Foto forma di pecorino di fossa",
    image: "",
  },
  {
    slug: "bistecca-marchigiana",
    name: "Bistecca di razza marchigiana",
    shopSlug: "carni",
    category: "Carni",
    description:
      "Carne di razza marchigiana, frollata e tagliata al momento su richiesta dal nostro banco carni.",
    imageLabel: "Il banco carni: filetto, roastbeef e fettine di scottona",
    image: "/images/banco-carni-bovino.jpg",
  },
];

export type BlogPost = {
  slug: string;
  title: string;
  date: string;
  category: string;
  /** One of the four templates in `lib/blog-article.ts`. */
  layout: string;
  excerpt: string;
  /**
   * The body, one block per entry, in the grammar `lib/blog-article.ts` parses:
   * plain paragraphs plus `## titolo`, `- voce`, `> citazione`, `| campo |
   * valore` and `![didascalia](/images/x.jpg)`.
   */
  content: string[];
  imageLabel: string;
  image?: string;
};

/**
 * The diary, as it ships.
 *
 * Every photograph named here is a real shot of the bottega in `public/images`,
 * and every caption describes what is actually in the frame — the one rule
 * `scripts/fix-image-labels.ts` exists to enforce, after a caption reading
 * "porchetta intera sul banco" spent months pointing at two trays of marinated
 * chicken.
 *
 * The four posts deliberately use the four templates: a long read, a magazine
 * round-up, a printed notice and a photo essay. Not decoration — a change of
 * opening hours and the story of the Saturday roast are different kinds of
 * writing, and giving them the same page was most of what made the diary read
 * as filler.
 */
export const blogPosts: BlogPost[] = [
  {
    slug: "giro-attorno-al-banco-dei-salumi",
    title: "Un giro attorno al banco dei salumi",
    date: "2026-08-08",
    category: "Bottega",
    layout: "galleria",
    excerpt:
      "Sopra il banco ci sono una sessantina di pezzi appesi, e nessuno è lì per caso. Cosa sono, come si riconoscono e come si tengono a casa senza rovinarli.",
    content: [
      "Chi entra per la prima volta guarda sempre in alto. Sopra il banco, appesi ai ganci di acciaio, ci sono i ciauscoli, i salamini, le culatte nella loro rete, i capocolli fasciati di carta scura, le pancette arrotolate. Da fuori sembra un allestimento. È invece la parte del negozio che lavora di più: ogni pezzo sta lì perché all'aria continua a stagionare, e ogni giorno che passa è un pezzo leggermente diverso da quello di ieri.",

      "Questo non è un articolo di ricette. È un giro attorno al banco, per capire cosa si sta guardando prima di chiedere l'etto.",

      "![Le culatte, i capocolli e le pancette appesi dietro al banco | panoramica](/images/salumi-appesi-stagionatura.jpg)",

      "## I nostri e quelli scelti",

      "Metà di quello che vedete appeso porta la nostra etichetta: il ciauscolo IGP, i salamini, i pezzi lavorati come li faceva il nonno, con la carne di suino scelta e la macinatura fatta qui. L'altra metà no, ed è una scelta dichiarata: certe cose si fanno meglio dove si sono sempre fatte. I prosciutti crudi arrivano da chi li stagiona da generazioni; le culatte, dalle cantine dove la nebbia fa la sua parte.",

      "Sono due mestieri diversi. Il primo è produrre, il secondo è scegliere — assaggiare, scartare, tornare l'anno dopo dal produttore che ha tenuto la parola. Il banco è il posto dove i due si incontrano, ed è per quello che i cartellini si leggono tutti: sopra ognuno c'è scritto cos'è e da dove viene.",

      "> Un salume non lo giudichi da come è fatto. Lo giudichi da come è invecchiato: è lì che si vede se qualcuno lo ha seguito.",
      "— Dietro il banco, da tre generazioni",

      "![Il taglio a mano, davanti alle forme di formaggio | alta](/images/paolo-taccalite-ritratto.jpg)",
      "![Il crudo affettato sottile e servito nel piatto | alta](/images/prosciutto-crudo-piatto.jpg)",

      "## Il taglio non è un dettaglio",

      "Lo spessore cambia il sapore più di quanto sembri. Il crudo va sottile, quasi trasparente, perché il grasso si sciolga in bocca: tagliato spesso resta gommoso e sa di poco. Il ciauscolo invece non si affetta affatto — si spalma, ed è la ragione per cui in tavola va servito a temperatura ambiente e non appena uscito dal frigorifero.",

      "I salami stagionati stanno nel mezzo: fetta obliqua, spessa quanto una moneta. Il capocollo vuole la fetta sottile ma non trasparente, altrimenti si perde la venatura. Sono cose che al banco si chiedono, e che nessuno si offende a sentirsi chiedere.",

      "![I prosciutti nella loro sugna, appesi sopra il banco | quadrata](/images/prosciutti-stagionatura.jpg)",
      "![Il ciauscolo e i salamini di casa, appesi sopra le forme | quadrata](/images/salumi-appesi-bottega-alt.jpg)",

      "## Come si tengono a casa",

      "La regola è una sola: il salume teme il freddo secco del frigorifero più di quanto tema il tempo. Un pezzo intero, avvolto in un canovaccio pulito e tenuto nel punto più fresco della dispensa, si conserva meglio di uno chiuso nella pellicola in fondo al frigo.",

      "| Pezzo intero | In un canovaccio di cotone, in un luogo fresco e arieggiato",
      "| Già affettato | In frigorifero, ma fuori mezz'ora prima di servirlo",
      "| Il taglio esposto | Coperto con un velo del suo stesso grasso, non con la pellicola",
      "| Il ciauscolo | Sempre a temperatura ambiente, altrimenti non si spalma",

      "Se il taglio si asciuga e diventa scuro, non è andato a male: basta togliere il primo velo e sotto è intatto. È la stessa cosa che facciamo noi ogni mattina prima di aprire.",

      "## E se non si sa cosa scegliere",

      "Si chiede. Un tagliere per quattro persone lo componiamo al momento su quello che quel giorno è al punto giusto, ed è quasi sempre meglio che scegliere per nome: il pezzo buono è quello pronto oggi, non quello che si conosce già.",
    ],
    imageLabel: "Il ciauscolo e i salumi di casa appesi sopra il banco",
    image: "/images/salumi-appesi-bottega.jpg",
  },
  {
    slug: "porchetta-del-sabato",
    title: "Torna la porchetta del sabato in Piazza Kennedy",
    date: "2026-06-20",
    category: "Tradizione",
    layout: "editoriale",
    excerpt:
      "Ogni sabato mattina la porchetta esce calda dal forno, e quasi sempre entro sera è finita. Come nasce, a che ora conviene passare e perché è meglio prenotarla entro il venerdì.",
    content: [
      "Il sabato in bottega comincia molto prima del sabato. Il venerdì pomeriggio, quando la saracinesca è già mezza abbassata e in negozio resta accesa solo la luce del banco, la porchetta è lì che aspetta: aperta, condita, legata stretta e pronta per il forno. Da fuori sembra il giorno più tranquillo della settimana. Dentro è quello che decide come andrà il giorno dopo.",

      "È un appuntamento che in famiglia si ripete da tre generazioni, e che nella sostanza non è mai cambiato. Sono cambiati i forni, sono cambiate le persone dietro al banco, è perfino cambiato il modo di ordinarla — adesso si può fare dal sito. Non è cambiata l'ora in cui esce, né il fatto che di solito, prima di sera, non ne resta niente.",

      "## Il condimento, e la parte che non si vede",

      "La preparazione è la parte lenta. La carne va scelta, disossata e aperta; poi arriva il condimento, che è la sola cosa di cui in bottega non si parla volentieri: sale, pepe, aglio, finocchio e il rosmarino, in proporzioni che non stanno scritte da nessuna parte se non nelle mani di chi le fa da quarant'anni.",

      "Poi si lega, e questo è il passaggio che nessuno associa alla porchetta. Giro dopo giro, stretto, perché in cottura la carne si ritira: se la legatura è larga il rotolo si apre, i succhi se ne vanno nella teglia e la cotenna non tira più. È la cosa che si vede meno nel prodotto finito ed è quella che lo decide.",

      "> La porchetta non si fa il sabato. Il sabato si tira fuori dal forno: tutto il resto è già successo il giorno prima.",

      "## Alle sette il forno è già acceso",

      "Il sabato mattina il negozio apre con il forno in funzione da ore. La cottura è lunga e bassa — serve tempo perché il grasso si sciolga e la carne resti morbida — e sale solo alla fine, perché la cotenna diventi croccante invece che dura. È l'unico momento della settimana in cui dal forno non ci si allontana.",

      "Nello stesso forno, insieme alla porchetta, vanno le teglie del giorno: pollo e coniglio marinati con le erbe, i peperoni, le olive. Chi passa verso le nove trova tutto insieme, ed è il motivo per cui il sabato mattina davanti al banco si fa un po' di coda.",

      "![Le teglie di carni marinate che vanno in forno insieme alla porchetta | alta](/images/gastronomia-teglie-forno.jpg)",

      "## Come prenotarla",

      "Non serve un anticipo e non serve una formula particolare: basta dirci quanti chili volete e per quale sabato. La prenotazione si fa dalla pagina dedicata oppure per telefono, entro il venerdì — è l'unico modo per essere sicuri di trovarla.",

      "| Quando | Ogni sabato mattina, calda dal forno",
      "| Dove | Al banco della gastronomia, finché c'è",
      "| Entro quando | Il venerdì, per la porchetta del sabato successivo",
      "| Come | Dalla [pagina della porchetta](/porchetta) o per telefono, senza anticipo",

      "## Come chiederla al banco",

      "- **Alta o bassa.** La fetta alta resta più morbida, quella bassa fa più crosta: se è per un panino, chiedila bassa.",
      "- **Con la cotenna o senza.** Non è una domanda scontata: c'è chi la vuole tutta e chi la lascia sul tagliere.",
      "- **In un pezzo solo.** Se la prendi la mattina per la sera, falla lasciare intera: si taglia dopo e resta più succosa.",
      "- **Quanta.** Per un panino a testa contiamo circa un etto e mezzo a persona; per un tagliere in mezzo alla tavola, il doppio.",

      "Se arrivi tardi e non ne trovi più, non è una scusa: il sabato se ne prepara una quantità, e quella è. Prenotare entro il venerdì è l'unico modo per non doverci credere sulla parola.",
    ],
    imageLabel: "La porchetta tagliata al momento, con la cotenna croccante",
    image: "/images/porchetta-affettata-tagliere.jpg",
  },
  {
    slug: "nuovi-formaggi-stagionati",
    title: "Quattro formaggi cremosi nuovi al banco del Centro",
    date: "2026-05-14",
    category: "Prodotti",
    layout: "rivista",
    excerpt:
      "Taleggio, gorgonzola, roquefort e nuvola di capra: quattro forme nuove al banco di Piazza Kennedy. Cosa sono, con cosa stanno bene e come si tengono a casa.",
    content: [
      "Il banco dei formaggi del Centro si allarga di quattro forme, e non sono arrivate insieme per caso: sono tutte paste molli o erborinate, la famiglia che in una norcineria si trova più di rado. Chiedono spazio, temperatura e rotazione — cioè le tre cose che un banco piccolo non può permettersi se non vende. Adesso vende.",

      "Le abbiamo scelte una a una, assaggiando la forma prima di prenderla. Quello che segue è quanto basta per orientarsi al banco senza dover chiedere tutto, anche se chiedere resta il modo migliore.",

      "## Le quattro forme, in breve",

      "| Taleggio | Pasta molle di latte vaccino, crosta lavata. Dolce da giovane, deciso dopo",
      "| Gorgonzola | Erborinato vaccino, nella versione dolce e cremosa da cucchiaio",
      "| Roquefort | Erborinato di latte di pecora, stagionato in grotta. Sapido, pungente, salato",
      "| Nuvola di capra | Pasta fresca caprina, acidula e leggerissima. La più delicata delle quattro",

      "## Taleggio e gorgonzola: le due che tutti conoscono",

      "Sono le due che vendono di più e le due che più spesso si comprano male. Il taleggio va chiesto guardando la crosta: se è ancora chiara e appena umida la pasta sarà compatta e dolce, se ha virato all'arancione il formaggio ha lavorato e sotto sarà molto più intenso. Non c'è una versione giusta — c'è quella che serve a voi quella sera.",

      "Il gorgonzola che teniamo è il dolce, quello che si prende col cucchiaio e non con il coltello. In cucina si scioglie senza fare grumi ed è quello che rende una polenta o un risotto senza bisogno di panna; a crudo, su una fetta di pane tiepido, non ha bisogno di altro.",

      "![Formaggi al taglio e crudo affettato sullo stesso tagliere | larga](/images/tagliere-formaggi-salumi.jpg)",

      "> Una forma la compri due volte: la prima quando la assaggi dal produttore, la seconda quando la tagli al banco e vedi se ha mantenuto.",

      "## Il roquefort, e perché sta in un banco marchigiano",

      "È l'unico dei quattro che non è italiano, e la domanda arriva puntuale. La risposta è che al banco serviva un erborinato salato e pungente, e in quella direzione il roquefort è difficile da battere: latte di pecora, stagionatura in grotta, una sapidità che regge il confronto con qualunque cosa gli si metta accanto.",

      "Sta benissimo dove il gorgonzola sarebbe troppo morbido: con il miele di castagno, con le noci, dentro un burro montato per accompagnare una carne alla brace. Chiedetene poco alla volta — è un formaggio che si consuma lentamente e non guadagna nulla a restare in frigorifero.",

      "## La nuvola di capra",

      "La più delicata, e la più stagionale nel modo di usarla: fresca, acidula, quasi soffice. Va mangiata giovane e va tenuta poco. Con un filo d'olio e il pepe è un antipasto finito; con le confetture del banco — quella di cipolla, quella di fichi — diventa il tagliere di fine pasto senza altro lavoro.",

      "## Come li abbiniamo",

      "- **Miele di castagno** sul roquefort, e miele di acacia sulla nuvola di capra: il primo regge il salato, il secondo non copre l'acidità.",
      "- **Confetture** di cipolla o di fichi con il taleggio maturo.",
      "- **Un rosso non troppo strutturato** con il gorgonzola: la pasta grassa vuole acidità, non tannino.",
      "- **Pane tiepido**, sempre. Un formaggio molle su un pane freddo perde metà del profumo.",

      "![L'angolo dei vini in bottega, con le forme sugli scaffali alti | alta](/images/bottega-angolo-aperitivo.jpg)",

      "## Come si tengono a casa",

      "Il frigorifero è necessario ma non basta: quello che rovina un formaggio molle è la pellicola aderente, che gli toglie l'aria e gli fa prendere l'odore del frigo. Meglio la carta in cui ve lo incartiamo, in un contenitore chiuso male apposta, nel ripiano meno freddo.",

      "E mezz'ora fuori prima di portarlo in tavola. È l'unico consiglio che vale per tutti e quattro, e quello che quasi nessuno segue.",

      "## Dove trovarli",

      "Al banco di [Taccalite Centro](/negozi), in Piazza Kennedy. Si assaggia prima di comprare — per le paste molli è l'unico modo serio di scegliere.",
    ],
    imageLabel: "Formaggi al taglio e salumi sul tagliere di casa",
    image: "/images/tagliere-formaggi-verticale.jpg",
  },
  {
    slug: "orari-festivi",
    title: "Orari, ordini e chiusure: come funziona nei giorni di festa",
    date: "2026-04-02",
    category: "Avvisi",
    layout: "avviso",
    excerpt:
      "Gli orari ordinari dei due negozi, come cambiano nei giorni di festa e con quanto anticipo conviene ordinare quello che prepariamo su richiesta.",
    content: [
      "Nei giorni di festa cambiano due cose: gli orari e i tempi. Gli orari li aggiorniamo qui e li esponiamo in vetrina appena sono decisi; i tempi dipendono da voi, perché quasi tutto quello che si porta in tavola nelle feste va ordinato prima.",

      "| Taccalite Centro | Piazza Kennedy 10 — lun-sab 9:00-20:00, orario continuato",
      "| Taccalite Mercato del Piano | Piazza d'Armi 59 — orari da confermare in negozio",
      "| Domenica | Entrambi i negozi chiusi",
      "| Giorni di festa | Orari straordinari: pubblicati qui e affissi in vetrina prima di ogni festività",
      "| Ordini su richiesta | Entro 3-4 giorni dal ritiro, meglio se prima",

      "Vale per entrambe le botteghe, che nelle feste lavorano in modo diverso: il Centro, in Piazza Kennedy, tiene l'orario continuato e si riempie soprattutto nel pomeriggio; il Mercato del Piano segue gli orari del mercato coperto, che nelle giornate festive possono cambiare. Se dovete fare una sola tappa, chiamate prima quella che vi viene più comoda.",

      "## Ordinate con qualche giorno di anticipo",

      "Nei giorni prima di una festa il banco lavora al doppio della velocità normale, e le cose che richiedono preparazione — un arrosto legato, un tagliere composto, la porchetta — vanno messe in conto prima. Tre o quattro giorni sono di solito sufficienti; per i numeri grandi, meglio una settimana.",

      "Non è burocrazia: un arrosto si lega a mano e un tagliere si compone su quello che quel giorno è al punto giusto, e nessuna delle due cose si improvvisa con dieci persone in fila. Chi ordina prima trova il suo pacchetto pronto con il nome sopra e non aspetta.",

      "- Dite quante persone siete: sul resto vi consigliamo noi.",
      "- Indicate il giorno **e l'ora** del ritiro: nelle mattine di festa la fila si allunga in fretta.",
      "- Per la porchetta vale la regola di sempre: si prenota entro il venerdì, dalla [pagina dedicata](/porchetta) o per telefono.",

      "![La gastronomia pronta del giorno, nelle teglie del banco | larga](/images/gastronomia-preparati-freschi.jpg)",

      "## Cosa prepariamo su ordinazione",

      "- Arrosti e carni legate, pronte da infornare.",
      "- Taglieri di salumi e formaggi composti al momento, per il numero di persone che ci dite.",
      "- Gastronomia pronta: primi e secondi del giorno, olive all'ascolana, verdure.",
      "- Cesti e confezioni da regalo, concordati voce per voce.",

      "## Cosa cambia al banco",

      "Nelle settimane di festa la gastronomia pronta ruota più in fretta e il banco si svuota prima: quello che c'è la mattina spesso non c'è più nel pomeriggio. Il consiglio, se avete in mente qualcosa di preciso, è passare presto o farlo mettere da parte con una telefonata — costa un minuto e vi risparmia il giro a vuoto.",

      "## Se trovate chiuso",

      "Prima di muovervi, un colpo di telefono al negozio è sempre la strada più corta: gli orari straordinari di una singola giornata possono cambiare all'ultimo, e su questa pagina arrivano appena sono confermati. Trovate i numeri di entrambe le botteghe nella pagina [dei negozi](/negozi).",

      "Grazie a chi si organizza per tempo: è quello che ci permette di lavorare con calma anche nei giorni in cui il negozio non si svuota mai.",
    ],
    imageLabel: "La vetrina del banco carni, con i tagli del giorno",
    image: "/images/banco-carni-vetrina.jpg",
  },
];
