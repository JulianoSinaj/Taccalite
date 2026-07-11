export type Shop = {
  slug: string;
  name: string;
  specialty: string;
  tagline: string;
  description: string;
  address: string;
  addressConfirmed: boolean;
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
    addressConfirmed: true,
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
    imageLabel: "Foto banco formaggi — negozio Centro",
    image: "/images/negozio-centro-formaggi.jpg",
  },
  {
    slug: "carni",
    name: "Taccalite Mercato del Piano",
    specialty: "Carni & Salumi",
    tagline: "Le migliori carni e i salumi della tradizione marchigiana",
    description:
      "Il secondo negozio di famiglia, al Mercato Coperto del Piano. Qui trovate carni selezionate, salumi artigianali come il prosciutto di Norcia e i tagli pronti per la brace, lavorati con la stessa cura di sempre.",
    address: "Mercato Coperto del Piano — Ancona",
    addressConfirmed: true,
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
    imageLabel: "Foto banco carni — secondo negozio",
    image: "/images/negozio-carni-prosciutto.jpg",
  },
];

export type Product = {
  slug: string;
  name: string;
  shopSlug: string;
  category: string;
  description: string;
  imageLabel: string;
};

export const featuredProducts: Product[] = [
  {
    slug: "porchetta-artigianale",
    name: "Porchetta artigianale",
    shopSlug: "carni",
    category: "Specialità della casa",
    description:
      "La nostra porchetta, cotta lentamente secondo la ricetta di famiglia: pelle croccante e carne morbida, aromatizzata con le erbe delle Marche.",
    imageLabel: "Foto porchetta intera sul banco",
  },
  {
    slug: "ciauscolo-igp",
    name: "Ciauscolo IGP",
    shopSlug: "carni",
    category: "Salumi",
    description:
      "Il salame morbido e spalmabile tipico marchigiano, prodotto secondo la tradizione norcina di famiglia.",
    imageLabel: "Foto ciauscolo affettato",
  },
  {
    slug: "pecorino-di-fossa",
    name: "Pecorino di fossa",
    shopSlug: "centro",
    category: "Formaggi",
    description:
      "Stagionato in fossa secondo il metodo tradizionale marchigiano, dal profumo intenso e dal gusto deciso.",
    imageLabel: "Foto forma di pecorino di fossa",
  },
  {
    slug: "bistecca-marchigiana",
    name: "Bistecca di razza marchigiana",
    shopSlug: "carni",
    category: "Carni",
    description:
      "Carne di razza marchigiana, frollata e tagliata al momento su richiesta dal nostro banco carni.",
    imageLabel: "Foto bistecca sul tagliere",
  },
];

export type BlogPost = {
  slug: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
  content: string[];
  imageLabel: string;
  image?: string;
};

export const blogPosts: BlogPost[] = [
  {
    slug: "porchetta-del-sabato",
    title: "Torna la porchetta del sabato in Piazza Kennedy",
    date: "2026-06-20",
    category: "Tradizione",
    excerpt:
      "Ogni sabato mattina la nostra porchetta esce calda dal forno: ecco dove trovarla e come prenotarla in anticipo.",
    content: [
      "Ogni sabato mattina, il profumo della porchetta appena cotta invade il negozio di Piazza Kennedy. È un appuntamento che si tramanda in famiglia da generazioni, e che continua a richiamare habitué e curiosi.",
      "Per evitare la fila, è possibile prenotare la propria porchetta direttamente al negozio o telefonicamente entro il venerdì.",
    ],
    imageLabel: "Foto porchetta calda appena sfornata",
    image: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&q=80&w=800",
  },
  {
    slug: "nuovi-formaggi-stagionati",
    title: "Nuovi arrivi: formaggi cremosi da tutta Italia",
    date: "2026-05-14",
    category: "Prodotti",
    excerpt:
      "Ampliata la selezione di formaggi cremosi al negozio Centro, con taleggio, gorgonzola, roquefort e nuvola di capra.",
    content: [
      "Il nostro banco formaggi si arricchisce di nuove selezioni: taleggio, gorgonzola, roquefort e la delicata nuvola di capra, da abbinare alle nostre confetture e ai mieli in bottega.",
      "Passate a trovarci in Piazza Kennedy per una degustazione guidata dal nostro staff.",
    ],
    imageLabel: "Foto nuovo banco formaggi",
    image: "/images/negozio-centro-formaggi.jpg",
  },
  {
    slug: "orari-festivi",
    title: "Orari di apertura per le prossime festività",
    date: "2026-04-02",
    category: "Avvisi",
    excerpt:
      "Consulta gli orari aggiornati dei nostri due negozi per il periodo delle festività.",
    content: [
      "In occasione delle prossime festività, i nostri negozi osserveranno orari straordinari.",
      "Vi invitiamo a consultare questa pagina per gli aggiornamenti, o a contattarci direttamente.",
    ],
    imageLabel: "Foto vetrina negozio decorata",
    image: "/images/shop-shelves-prodotti.jpg",
  },
];
