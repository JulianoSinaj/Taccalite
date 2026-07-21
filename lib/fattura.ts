import "server-only";
import type { OrderRow, OrderItemRow } from "@/lib/db/schema";
import { splitGross, vatBreakdown } from "@/lib/fiscal";

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

export function buildFatturaXml(
  order: OrderRow,
  items: OrderItemRow[],
  fiscal: FiscalIdentity,
  progressivo: string,
): string {
  const dataDoc = (order.createdAt ? new Date(order.createdAt) : new Date()).toISOString().slice(0, 10);
  const addr = order.shippingAddress ?? {};
  const vat = vatBreakdown(items.map((i) => ({ grossCents: i.lineTotalCents, vatRateBps: i.vatRateBps })));
  // Shipping, if any, as a summary line at 22% (transport standard rate).
  const shippingRateBps = 2200;
  const netTotalCents =
    vat.reduce((s, b) => s + b.imponibileCents, 0) +
    (order.shippingCents > 0 ? splitGross(order.shippingCents, shippingRateBps).imponibileCents : 0);
  void netTotalCents;

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

  // Summary blocks: one per VAT rate present (goods + shipping merged).
  const allBuckets = vatBreakdown([
    ...items.map((i) => ({ grossCents: i.lineTotalCents, vatRateBps: i.vatRateBps })),
    ...(order.shippingCents > 0 ? [{ grossCents: order.shippingCents, vatRateBps: shippingRateBps }] : []),
  ]);
  const riepilogo = allBuckets
    .map(
      (b) => `      <DatiRiepilogo>
        <AliquotaIVA>${(b.rateBps / 100).toFixed(2)}</AliquotaIVA>
        <ImponibileImporto>${eur(b.imponibileCents)}</ImponibileImporto>
        <Imposta>${eur(b.impostaCents)}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>`,
    )
    .join("\n");

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
      <CodiceDestinatario>0000000</CodiceDestinatario>
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
      <DatiAnagrafici>
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
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${dataDoc}</Data>
        <Numero>${xml(order.orderNumber)}</Numero>
        <ImportoTotaleDocumento>${eur(order.totalCents)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
${lines}${shippingLine}
${riepilogo}
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP08</ModalitaPagamento>
        <ImportoPagamento>${eur(order.totalCents)}</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
}
