/**
 * "Come arrivare" — practical directions per shop.
 *
 * Deliberately not in the database: it is one-off local knowledge about a city,
 * not something the shop edits from the gestionale, and it changes about as
 * often as the bus network does. It lives here rather than on `/sedi` because
 * both the index and each bottega's own page tell the visitor how to get there,
 * and two copies of a bus route is how one of them goes stale.
 *
 * TODO(owner): verify the parking / bus details below on the ground.
 */
export type Directions = {
  walk: string;
  car: string;
  transit: string;
  /** Short form for the compact block on a shop page. */
  short: { walk: string; car: string; transit: string };
  note?: string;
};

const bySlug: Record<string, Directions> = {
  centro: {
    walk: "In fondo a Corso Stamira, a due passi dal porto e da Piazza della Repubblica: dal centro storico si arriva comodamente a piedi.",
    car: "Parcheggio Traiano (Via XXIX Settembre) a pochi minuti a piedi; strisce blu nelle vie intorno alla piazza.",
    transit:
      "Fermate dei bus urbani Conerobus in zona porto / Piazza Kennedy; dalla stazione centrale circa dieci minuti di autobus.",
    short: {
      walk: "Dal centro storico, in fondo a Corso Stamira",
      car: "Parcheggio Traiano + strisce blu in piazza",
      transit: "Conerobus, zona porto · 10 min dalla stazione",
    },
  },
  carni: {
    walk: "Dentro il Mercato Coperto del Piano, in Piazza d'Armi: il mercato storico del quartiere Piano San Lazzaro.",
    car: "Parcheggi a raso nell'area di Piazza d'Armi e strisce blu nelle vie del quartiere.",
    transit:
      "A pochi minuti a piedi dal nodo dei bus di Piazza Ugo Bassi; diverse linee urbane fermano lungo Corso Carlo Alberto.",
    short: {
      walk: "Dentro il Mercato Coperto, quartiere Piano",
      car: "Parcheggi a raso in Piazza d'Armi",
      transit: "Nodo bus di Piazza Ugo Bassi, a pochi passi",
    },
    note: "Gli orari seguono quelli del mercato coperto: se hai dubbi, chiamaci prima di passare.",
  },
};

const generic: Directions = {
  walk: "Nel cuore di Ancona, raggiungibile a piedi dal centro.",
  car: "Parcheggi pubblici nelle vicinanze.",
  transit: "Servita dalle linee urbane Conerobus.",
  short: {
    walk: "Nel cuore di Ancona",
    car: "Parcheggi pubblici nelle vicinanze",
    transit: "Linee urbane Conerobus",
  },
};

/** Directions for a shop; an unknown slug gets the generic block, never nothing. */
export function directionsFor(slug: string): Directions {
  return bySlug[slug] ?? generic;
}
