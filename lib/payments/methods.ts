/**
 * How an order gets paid — the single authority for payment methods.
 *
 * Deliberately isomorphic (no `server-only`, no DB, no `Date`): the checkout has
 * to offer exactly the methods the server will accept, and the only way to
 * guarantee that is for both to run this code. The server re-derives from its
 * own settings on submit and ignores whatever the client sent.
 *
 * Two orthogonal things are recorded, because they answer different questions:
 *
 *  - **`paymentMethod`** — how the order is *meant* to be paid. Chosen at
 *    checkout (or implied by a counter sale), never changes afterwards. This is
 *    what tells the driver an order is a contrassegno he has to collect for, and
 *    what tells the pickup list which orders still owe money.
 *  - **`paidWith`** — the instrument the money *actually* arrived on, set only
 *    when it does. Null until then. This is what the till reconciliation counts
 *    and what the electronic invoice's `ModalitaPagamento` is derived from — an
 *    order placed as "pago al ritiro" and settled in cash is MP01, the same
 *    order settled on the POS is MP08, and guessing either would put a wrong
 *    code on a fiscal document.
 */

export const PAYMENT_METHODS = ["card", "in_store", "on_delivery", "counter"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * The methods a *customer* may pick at checkout. `counter` is excluded on
 * purpose: it describes a sale rung up at the till by staff, which no online
 * checkout can be.
 */
export const CUSTOMER_PAYMENT_METHODS = ["card", "in_store", "on_delivery"] as const;
export type CustomerPaymentMethod = (typeof CUSTOMER_PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card: "Carta online",
  in_store: "Pagamento in bottega",
  on_delivery: "Contrassegno",
  counter: "Vendita al banco",
};

/** Column-width version for tables and badges. */
export const PAYMENT_METHOD_SHORT: Record<PaymentMethod, string> = {
  card: "Carta",
  in_store: "In bottega",
  on_delivery: "Contrassegno",
  counter: "Banco",
};

/** What the customer is told the choice means, on the checkout radio. */
export const PAYMENT_METHOD_HINT: Record<CustomerPaymentMethod, string> = {
  card: "Paghi ora online in modo sicuro. Nessun dato della carta transita dai nostri server.",
  in_store: "Prepariamo l'ordine e paghi al banco quando lo ritiri, in contanti o con il POS.",
  on_delivery: "Paghi alla consegna, in contanti o con il POS portatile del nostro incaricato.",
};

// ── Instruments ──────────────────────────────────────────────────────────────

export const PAYMENT_INSTRUMENTS = ["card", "cash", "pos", "transfer", "other"] as const;
export type PaymentInstrument = (typeof PAYMENT_INSTRUMENTS)[number];

export const PAYMENT_INSTRUMENT_LABEL: Record<PaymentInstrument, string> = {
  card: "Carta online",
  cash: "Contanti",
  pos: "POS / bancomat",
  transfer: "Bonifico",
  other: "Altro",
};

/**
 * The instruments an operator can settle an offline order with. `card` is
 * absent because it means "charged online through Stripe" — the operator cannot
 * produce one of those by ticking a box.
 */
export const SETTLEMENT_INSTRUMENTS = ["cash", "pos", "transfer", "other"] as const;

/**
 * FatturaPA `ModalitaPagamento` for each instrument (Allegato A, codice valore
 * 2.4.2.2). Getting this wrong is not cosmetic: it is a field on a document
 * filed with the SdI.
 */
const MP_CODE: Record<PaymentInstrument, string> = {
  cash: "MP01", // contanti
  transfer: "MP05", // bonifico
  card: "MP08", // carta di pagamento
  pos: "MP08", // carta di pagamento (terminale POS)
  other: "MP08",
};

/**
 * The `ModalitaPagamento` for an order.
 *
 * Prefers the instrument the money actually arrived on. Falls back to what the
 * method implies for an invoice issued before settlement — a card order that
 * reached invoicing was charged (MP08), and an unsettled counter/collection
 * order is overwhelmingly cash in this trade.
 */
export function modalitaPagamento(
  method: PaymentMethod | null | undefined,
  paidWith: PaymentInstrument | null | undefined,
): string {
  if (paidWith) return MP_CODE[paidWith];
  return method === "card" ? "MP08" : "MP01";
}

// ── Rules ────────────────────────────────────────────────────────────────────

/** True for methods that take the money before the goods move. */
export function isPrepaid(method: PaymentMethod): boolean {
  return method === "card";
}

/**
 * True for methods where the money arrives when the goods are handed over, so
 * the order legitimately sits `unpaid` until then and must never be swept up by
 * the abandoned-checkout cleanup.
 */
export function settlesOnHandover(method: PaymentMethod): boolean {
  return method === "in_store" || method === "on_delivery";
}

/** Which fulfilment mode each customer-selectable method belongs to. */
const METHOD_FULFILMENT: Record<CustomerPaymentMethod, readonly string[]> = {
  card: ["pickup", "delivery", "shipping"],
  // You cannot pay at a counter you are never going to stand at.
  in_store: ["pickup"],
  // The shop's own van has the POS in it; a courier does not.
  on_delivery: ["delivery"],
};

export type PaymentAvailability = {
  /** Card checkout is possible at all (Stripe keys present, or dev simulate). */
  cardEnabled: boolean;
  inStoreEnabled: boolean;
  onDeliveryEnabled: boolean;
  /** Refuse contrassegno above this order total (cents). 0 = no cap. */
  onDeliveryMaxCents: number;
};

/**
 * The methods offered for one fulfilment mode and basket, in the order they
 * should be shown. Empty is a real answer — an admin who disables card and
 * in-store leaves pickup with nothing, and the checkout has to say so rather
 * than render a dead radio group.
 */
export function paymentMethodsFor(
  fulfilment: string,
  totalCents: number,
  a: PaymentAvailability,
): CustomerPaymentMethod[] {
  return CUSTOMER_PAYMENT_METHODS.filter((m) => {
    if (!METHOD_FULFILMENT[m].includes(fulfilment)) return false;
    if (m === "card") return a.cardEnabled;
    if (m === "in_store") return a.inStoreEnabled;
    // A cap exists so nobody's driver carries €400 of change around.
    if (a.onDeliveryMaxCents > 0 && totalCents > a.onDeliveryMaxCents) return false;
    return a.onDeliveryEnabled;
  });
}

/**
 * Why a method was refused, in the customer's words, or null when it is fine.
 * Shares `paymentMethodsFor`'s rules so the checkout and the order endpoint can
 * never disagree about what is allowed.
 */
export function paymentMethodError(
  method: CustomerPaymentMethod,
  fulfilment: string,
  totalCents: number,
  a: PaymentAvailability,
): string | null {
  if (paymentMethodsFor(fulfilment, totalCents, a).includes(method)) return null;

  // `?? []` rather than a bare lookup: this is reached with whatever a client
  // posted, and an unrecognised method must fall through to the generic refusal
  // below instead of throwing on a missing key.
  if (!(METHOD_FULFILMENT[method] ?? []).includes(fulfilment)) {
    if (method === "in_store") return "Il pagamento in bottega è possibile solo con il ritiro.";
    if (method === "on_delivery") return "Il contrassegno è possibile solo con la consegna a domicilio.";
  }
  if (method === "on_delivery" && a.onDeliveryMaxCents > 0 && totalCents > a.onDeliveryMaxCents) {
    return `Il contrassegno è disponibile fino a ${(a.onDeliveryMaxCents / 100).toFixed(2)} €. Per questo ordine scegli il pagamento con carta.`;
  }
  return "Metodo di pagamento non disponibile per questo ordine.";
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}

export function isPaymentInstrument(v: unknown): v is PaymentInstrument {
  return typeof v === "string" && (PAYMENT_INSTRUMENTS as readonly string[]).includes(v);
}
