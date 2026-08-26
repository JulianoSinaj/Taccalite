/**
 * Validation for the shop's own fiscal identity.
 *
 * The Partita IVA is not decorative here: it is copied verbatim into the
 * `CedentePrestatore/IdFiscaleIVA/IdCodice` element of every FatturaPA XML, and
 * the SdI rejects a document whose seller VAT number fails its check digit
 * (error 00300 / 00301). A wrong one is therefore not a cosmetic slip — it is an
 * invoice that never arrives, discovered days later.
 *
 * The route already refused an *empty* number. What it could not see was a
 * syntactically wrong one: `scripts/seed-demo.ts` writes `11111111111`, whose
 * check digit should be 5, and that value passed straight through into a
 * generated XML. Hence a real check rather than a presence test.
 *
 * Deliberately isomorphic (no `server-only`): the same rule has to hold on the
 * settings form, in the action that saves it, and at the moment the document is
 * built.
 */

/** Strip spaces, dots and an `IT` country prefix. */
export function normalisePartitaIva(raw: string): string {
  return raw.trim().replace(/[\s.\-]/g, "").replace(/^IT/i, "");
}

/**
 * The official Partita IVA check digit (Luhn over 11 digits, as published by
 * the Agenzia delle Entrate): digits in odd positions are summed as-is, digits
 * in even positions are doubled with 9 subtracted when the result exceeds 9,
 * and the last digit must complete the total to a multiple of ten.
 */
export function isValidPartitaIva(raw: string): boolean {
  const v = normalisePartitaIva(raw);
  if (!/^\d{11}$/.test(v)) return false;
  // All-zeros satisfies the checksum arithmetic but is not an issued number, and
  // is a common placeholder — reject it explicitly rather than let it through.
  if (/^0{11}$/.test(v)) return false;

  let total = 0;
  for (let i = 0; i < 10; i++) {
    const d = v.charCodeAt(i) - 48;
    if (i % 2 === 0) {
      total += d;
    } else {
      const doubled = d * 2;
      total += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  const check = (10 - (total % 10)) % 10;
  return check === v.charCodeAt(10) - 48;
}

/**
 * Why a Partita IVA was refused, in the operator's words, or null when it is
 * fine. Blank is *not* an error here: the shop may not have entered one yet, and
 * the invoice route is the place that insists on it.
 */
export function partitaIvaError(raw: string): string | null {
  const v = normalisePartitaIva(raw);
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return "La partita IVA contiene caratteri non numerici (11 cifre, senza il prefisso IT).";
  if (v.length !== 11) return `La partita IVA deve avere 11 cifre (ne hai inserite ${v.length}).`;
  if (!isValidPartitaIva(v)) {
    return "La partita IVA non supera il controllo del codice di controllo: ricontrolla le cifre.";
  }
  return null;
}
