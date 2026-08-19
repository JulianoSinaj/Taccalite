import "server-only";
import type { OrderRow, OrderItemRow } from "@/lib/db/schema";
import { splitGross, orderVatBuckets, refundVatBuckets, vatRateLabel } from "@/lib/fiscal";

/**
 * FatturaPA (fattura elettronica) XML builder — FormatoTrasmissione FPR12, the
 * B2C/private variant. Produces a well-formed FatturaElettronica document from an
 * order + the shop's fiscal identity. It is NOT digitally signed or transmitted to
 * SdI (that requires a certified intermediary), but the XML is importable into an
 * Italian invoicing provider (Fatture in Cloud, TeamSystem, Danea…) for filing.
 *
 * Catalogue prices are VAT-inclusive; line/summary amounts here are the net
 * (imponibile) figures FatturaPA expects, derived exactly from the gross.
 */

export type FiscalIdentity = {
  legalName: string;
  vatNumber: string; // Partita IVA (numeric, no country prefix)
  taxCode: string; // Codice Fiscale
  address: string;
  zip: string;
  city: string;
  province: string;
  regime: string; // e.g. "RF01"
};

/** Map a free-text regime to a FatturaPA RegimeFiscale code (best effort). */
function regimeCode(regime: string): string {
  const r = regime.toLowerCase();
  if (r.includes("forfett")) return "RF19";
  if (r.includes("minim")) return "RF02";
  return "RF01"; // Ordinario
}

function xml(v: string | number | null | undefined): string {
  if (v == null) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const eur = (cents: number) => (cents / 100).toFixed(2);

/** Uppercase, strip spaces/punctuation — the form SdI expects for fiscal codes. */
function normalizeCode(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** ISO yyyy-mm-dd from a timestamp, falling back to now. */
const isoDay = (d: Date | null | undefined) => (d ? new Date(d) : new Date()).toISOString().slice(0, 10);

/**
 * The document number of the credit note for an order.
 *
 * Derived from the invoice number rather than drawn from a register: the shop
 * has no sezionale, and a deterministic `NC-<numero>` keeps the credit note
 * traceable to its invoice and stable across re-downloads. One refund per order
 * is the model (`refundedCents` is cumulative), so it cannot collide.
 */
export const creditNoteNumber = (orderNumber: string) => `NC-${orderNumber}`;

export function buildFatturaXml(
  order: OrderRow,
  items: OrderItemRow[],
  fiscal: FiscalIdentity,
  progressivo: string,
  shippingVatBps = 2200,
): string {
  // Invoice date = when the sale settled, falling back to when it was placed.
  const dataSource = order.paidAt ?? order.createdAt;
  const dataDoc = isoDay(dataSource);
  const addr = order.shippingAddress ?? {};

  // Buyer fiscal identity. SdI requires *something* here: a business gives a
  // P.IVA and a 7-char recipient code (or a PEC); a private customer gives a
  // codice fiscale and the catch-all "0000000" destination. Codes are normalised
  // because SdI rejects lowercase and spacing.
  const buyerVat = normalizeCode(order.customerVatNumber);
  const buyerTaxCode = normalizeCode(order.customerTaxCode);
  const pec = order.customerPec?.trim() || "";
  const sdiRaw = normalizeCode(order.customerSdiCode);
  const sdiCode = sdiRaw.length === 7 ? sdiRaw : "0000000";
  const shippingRateBps = shippingVatBps;
  // VAT summary reconciled with ImportoTotaleDocumento: line grosses net of the
  // apportioned discount, plus shipping at its configured rate. A cart-level
  // discount is declared as a document ScontoMaggiorazione so the line totals
  // (which are gross-derived and pre-discount) still reconcile to the total.
  const buckets = orderVatBuckets({
    items: items.map((i) => ({ grossCents: i.lineTotalCents, vatRateBps: i.vatRateBps })),
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    shippingVatBps: shippingRateBps,
  });

  const lines = items
    .map((it, idx) => {
      const { imponibileCents } = splitGross(it.lineTotalCents, it.vatRateBps);
      const unitNet = imponibileCents / it.quantity / 100;
      return `      <DettaglioLinee>
        <NumeroLinea>${idx + 1}</NumeroLinea>
        <Descrizione>${xml(it.name)}</Descrizione>
        <Quantita>${it.quantity.toFixed(2)}</Quantita>
        <PrezzoUnitario>${unitNet.toFixed(6)}</PrezzoUnitario>
        <PrezzoTotale>${eur(imponibileCents)}</PrezzoTotale>
        <AliquotaIVA>${(it.vatRateBps / 100).toFixed(2)}</AliquotaIVA>
      </DettaglioLinee>`;
    })
    .join("\n");

  const shippingLine =
    order.shippingCents > 0
      ? (() => {
          const { imponibileCents } = splitGross(order.shippingCents, shippingRateBps);
          return `
      <DettaglioLinee>
        <NumeroLinea>${items.length + 1}</NumeroLinea>
        <Descrizione>Spese di spedizione</Descrizione>
        <PrezzoUnitario>${(imponibileCents / 100).toFixed(6)}</PrezzoUnitario>
        <PrezzoTotale>${eur(imponibileCents)}</PrezzoTotale>
        <AliquotaIVA>${(shippingRateBps / 100).toFixed(2)}</AliquotaIVA>
      </DettaglioLinee>`;
        })()
      : "";

  // Summary blocks: one per VAT rate present (goods net of discount + shipping).
  const riepilogo = buckets
    .map(
      (b) => `      <DatiRiepilogo>
        <AliquotaIVA>${(b.rateBps / 100).toFixed(2)}</AliquotaIVA>
        <ImponibileImporto>${eur(b.imponibileCents)}</ImponibileImporto>
        <Imposta>${eur(b.impostaCents)}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>`,
    )
    .join("\n");

  // A cart-level coupon is declared once at document level (type SC = sconto).
  const scontoBlock =
    order.discountCents > 0
      ? `
        <ScontoMaggiorazione>
          <Tipo>SC</Tipo>
          <Importo>${eur(order.discountCents)}</Importo>
        </ScontoMaggiorazione>`
      : "";

  return renderDocument({
    order,
    fiscal,
    progressivo,
    tipoDocumento: "TD01",
    numero: order.orderNumber,
    dataDoc,
    totalCents: order.totalCents,
    lines: `${lines}${shippingLine}`,
    riepilogo,
    extraGenerali: scontoBlock,
    collegate: "",
    buyer: { vat: buyerVat, taxCode: buyerTaxCode, pec, sdiCode },
    addr,
  });
}

/**
 * Nota di credito (TD04) for the refunded portion of an order.
 *
 * A refunded sale needs a fiscal counter-document: without one the original
 * invoice still declares VAT on money that went back to the customer. The
 * amounts mirror `refundVatBuckets` — the refund apportioned across the rates
 * actually charged — so invoice minus credit note equals what was kept, to the
 * cent. `DatiFattureCollegate` ties it to the invoice it reverses.
 *
 * One line per VAT rate rather than a copy of the original lines: a refund is an
 * amount, not a list of returned goods, and a partial refund cannot be attributed
 * to specific items.
 */
export function buildNotaCreditoXml(
  order: OrderRow,
  items: OrderItemRow[],
  fiscal: FiscalIdentity,
  progressivo: string,
  shippingVatBps = 2200,
): string {
  const buckets = refundVatBuckets({
    items: items.map((i) => ({ grossCents: i.lineTotalCents, vatRateBps: i.vatRateBps })),
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    shippingVatBps,
    refundedCents: order.refundedCents,
  });

  const lines = buckets
    .map(
      (b, idx) => `      <DettaglioLinee>
        <NumeroLinea>${idx + 1}</NumeroLinea>
        <Descrizione>${xml(`Rimborso ordine ${order.orderNumber} — IVA ${vatRateLabel(b.rateBps)}`)}</Descrizione>
        <Quantita>1.00</Quantita>
        <PrezzoUnitario>${(b.imponibileCents / 100).toFixed(6)}</PrezzoUnitario>
        <PrezzoTotale>${eur(b.imponibileCents)}</PrezzoTotale>
        <AliquotaIVA>${(b.rateBps / 100).toFixed(2)}</AliquotaIVA>
      </DettaglioLinee>`,
    )
    .join("\n");

  const riepilogo = buckets
    .map(
      (b) => `      <DatiRiepilogo>
        <AliquotaIVA>${(b.rateBps / 100).toFixed(2)}</AliquotaIVA>
        <ImponibileImporto>${eur(b.imponibileCents)}</ImponibileImporto>
        <Imposta>${eur(b.impostaCents)}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>`,
    )
    .join("\n");

  // Points SdI at the invoice being corrected.
  const collegate = `
      <DatiFattureCollegate>
        <IdDocumento>${xml(order.orderNumber)}</IdDocumento>
        <Data>${isoDay(order.paidAt ?? order.createdAt)}</Data>
      </DatiFattureCollegate>`;

  const addr = order.shippingAddress ?? {};
  const sdiRaw = normalizeCode(order.customerSdiCode);

  return renderDocument({
    order,
    fiscal,
    progressivo,
    tipoDocumento: "TD04",
    numero: creditNoteNumber(order.orderNumber),
    // The credit note is dated when the money actually went back.
    dataDoc: isoDay(order.refundedAt ?? order.updatedAt),
    totalCents: order.refundedCents,
    lines,
    riepilogo,
    extraGenerali: "",
    collegate,
    buyer: {
      vat: normalizeCode(order.customerVatNumber),
      taxCode: normalizeCode(order.customerTaxCode),
      pec: order.customerPec?.trim() || "",
      sdiCode: sdiRaw.length === 7 ? sdiRaw : "0000000",
    },
    addr,
  });
}

/**
 * The shared FatturaPA envelope. Both an invoice (TD01) and a credit note (TD04)
 * are the same document with a different type, number, date, body and total —
 * keeping one renderer means the two can never drift apart on the header, which
 * is where SdI validation is strictest.
 */
function renderDocument(p: {
  order: OrderRow;
  fiscal: FiscalIdentity;
  progressivo: string;
  tipoDocumento: "TD01" | "TD04";
  numero: string;
  dataDoc: string;
  totalCents: number;
  lines: string;
  riepilogo: string;
  extraGenerali: string;
  collegate: string;
  buyer: { vat: string; taxCode: string; pec: string; sdiCode: string };
  addr: Record<string, string>;
}): string {
  const { order, fiscal, buyer, addr } = p;
  const { pec, sdiCode } = buyer;
  const buyerVat = buyer.vat;
  const buyerTaxCode = buyer.taxCode;
  const progressivo = p.progressivo;
  const idPaese = "IT";
  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>${idPaese}</IdPaese>
        <IdCodice>${xml(fiscal.vatNumber)}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${xml(progressivo)}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${xml(sdiCode)}</CodiceDestinatario>${
        pec ? `\n      <PECDestinatario>${xml(pec)}</PECDestinatario>` : ""
      }
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>${idPaese}</IdPaese>
          <IdCodice>${xml(fiscal.vatNumber)}</IdCodice>
        </IdFiscaleIVA>
        ${fiscal.taxCode ? `<CodiceFiscale>${xml(fiscal.taxCode)}</CodiceFiscale>` : ""}
        <Anagrafica>
          <Denominazione>${xml(fiscal.legalName)}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${regimeCode(fiscal.regime)}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${xml(fiscal.address)}</Indirizzo>
        <CAP>${xml(fiscal.zip)}</CAP>
        <Comune>${xml(fiscal.city)}</Comune>
        <Provincia>${xml(fiscal.province)}</Provincia>
        <Nazione>${idPaese}</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>${
        buyerVat
          ? `
        <IdFiscaleIVA>
          <IdPaese>${idPaese}</IdPaese>
          <IdCodice>${xml(buyerVat)}</IdCodice>
        </IdFiscaleIVA>`
          : ""
      }${
        buyerTaxCode ? `\n        <CodiceFiscale>${xml(buyerTaxCode)}</CodiceFiscale>` : ""
      }
        <Anagrafica>
          <Denominazione>${xml(order.name)}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${xml(addr.address || "-")}</Indirizzo>
        <CAP>${xml(addr.zip || fiscal.zip)}</CAP>
        <Comune>${xml(addr.city || fiscal.city)}</Comune>
        <Nazione>${idPaese}</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${p.tipoDocumento}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${p.dataDoc}</Data>
        <Numero>${xml(p.numero)}</Numero>${p.extraGenerali}
        <ImportoTotaleDocumento>${eur(p.totalCents)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>${p.collegate}
    </DatiGenerali>
    <DatiBeniServizi>
${p.lines}
${p.riepilogo}
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP08</ModalitaPagamento>
        <ImportoPagamento>${eur(p.totalCents)}</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
}
