import { siteConfig, absoluteUrl } from "@/lib/site";
import type { FulfilmentMode } from "@/lib/fulfilment";

type Built = { subject: string; html: string; text: string };

/**
 * Escape a value for safe interpolation into email HTML. User-supplied fields
 * (names, notes, email, phone, free-text dates) must go through this so a value
 * like `<script>` or broken markup can't inject into the owner's/customer's
 * inbox. NOTE: the admin-composed newsletter body is intentionally NOT escaped
 * (it's trusted HTML authored in the gestionale).
 */
function esc(v: string | number | null | undefined): string {
  if (v == null) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The quiet ink — row labels, footnotes, the "if this wasn't you" line.
 *
 * `#807868` (the storefront's old taupe) measured 3.93:1 on the card and 3.48
 * on the outer ground, and it carries 11–14px type, so the large-text exemption
 * never applied. Deepened to clear 4.5:1 on all three light grounds this shell
 * uses. It must not be put on the dark header/footer band, where it is 3.11 —
 * that band has `#cbb89b` (9.33:1).
 */
const MUTED = "#6b6557";

/**
 * A call to action that survives Outlook.
 *
 * A padded `<a>` is the obvious way to draw one, and it is what these used to
 * be — but Outlook on Windows renders through Word, which ignores padding on an
 * inline element. The gold pill collapsed to gold text on the page ground: no
 * shape, no target, and the one thing the message is asking you to do stops
 * looking like a button. A single-cell table gets its padding honoured
 * everywhere, and the `<a>` inside keeps the whole cell clickable.
 */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
    <tr><td bgcolor="#e1be64" style="background:#e1be64;border-radius:999px;">
      <a href="${href}" style="display:inline-block;padding:13px 24px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#2a1a10;text-decoration:none;border-radius:999px;">${label}</a>
    </td></tr>
  </table>`;
}

/**
 * Brand-styled responsive email shell (inline styles for client compatibility).
 *
 * The preheader is not optional in practice, only in the signature. A client
 * with no hidden preheader to read previews the first text in the body — and
 * the first text in this body is the letterhead, so twelve of these previewed
 * in the inbox as "Taccalite Norcineria dal 1946" and spent the one line the
 * reader sees before opening on the sender's own name. Callers that have
 * something better to say still pass it; the rest fall back to the opening of
 * their own copy, which is never worse than the letterhead.
 */
function layout(opts: { heading: string; body: string; preheader?: string }): string {
  const preheader = opts.preheader ?? htmlToText(opts.body).split("\n")[0].slice(0, 140);
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.heading)}</title>
<!-- Declared light-only on purpose. Apple Mail and Outlook.com re-colour an
     email that does not say what it supports, and their automatic inversion
     turns this composition inside out: the cream card goes muddy and the ink on
     the gold button — which stays gold, because it is a background colour they
     keep — is lightened to near-invisible. Saying "light" leaves it alone. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>:root{color-scheme:light;supported-color-schemes:light;}</style>
</head>
<body style="margin:0;background:#efe4d2;font-family:Helvetica,Arial,sans-serif;color:#2a1a10;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe4d2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#f8f2e8;border-radius:20px;overflow:hidden;box-shadow:0 20px 50px -20px rgba(42,26,16,.35);">
        <tr><td style="background:#1c1512;padding:28px 32px;">
          <div style="font-size:24px;font-weight:800;letter-spacing:-.5px;color:#f8f2e8;text-transform:uppercase;">Taccalite</div>
          <div style="font-size:11px;letter-spacing:3px;color:#e1be64;text-transform:uppercase;margin-top:4px;">Norcineria dal 1946</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 18px;font-size:22px;color:#2a1a10;">${opts.heading}</h1>
          ${opts.body}
        </td></tr>
        <tr><td style="padding:22px 32px;background:#1c1512;color:#cbb89b;font-size:12px;line-height:1.6;">
          Norcineria Taccalite · Ancona (Marche)<br>
          <a href="${absoluteUrl("/")}" style="color:#e1be64;text-decoration:none;">${siteConfig.url.replace(/^https?:\/\//, "")}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * "15 agosto 2026" from the ISO `yyyy-mm-dd` the date columns store. Anything
 * that isn't one comes back untouched, so a caller passing prose keeps it.
 */
function fmtDateIt(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "sabato 15 agosto alle 10:00" for a stored pickup instant, on the shop's clock. */
function fmtPickupIt(at: Date): string {
  return at.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One label/value pair of a detail table.
 *
 * A `<th scope="row">`, not a second `<td>`: these tables are the substance of
 * the message — the booking, the order, the message from the contact form — and
 * a screen reader that knows the first cell names the second reads "Telefono,
 * 071 663 5605" instead of two loose values. The tables that hold them are data
 * tables and therefore carry no `role="presentation"`; the ones that only push
 * pixels around, in `layout` and `button`, still do.
 */
function row(label: string, value: string): string {
  if (!value) return "";
  // `label` is a hard-coded constant; `value` is often user-supplied → escape it.
  return `<tr>
    <th scope="row" align="left" style="padding:8px 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};width:150px;vertical-align:top;font-weight:400;">${label}</th>
    <td style="padding:8px 0;font-size:15px;color:#2a1a10;">${esc(value)}</td>
  </tr>`;
}

export type ReservationEmailData = {
  reference: string;
  type: "table" | "porchetta" | "order";
  name: string;
  phone: string;
  email?: string | null;
  date: string;
  time?: string | null;
  guests?: number | null;
  quantityKg?: number | null;
  shopName: string;
  notes?: string | null;
};

const TYPE_LABEL: Record<ReservationEmailData["type"], string> = {
  table: "Tavolo / degustazione",
  porchetta: "Porchetta del sabato",
  order: "Ordine speciale",
};

function reservationDetailTable(d: ReservationEmailData): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
    ${row("Riferimento", d.reference)}
    ${row("Tipo", TYPE_LABEL[d.type])}
    ${row("Negozio", d.shopName)}
    ${row("Data", fmtDateIt(d.date))}
    ${row("Ora", d.time ?? "")}
    ${row("Ospiti", d.guests != null ? String(d.guests) : "")}
    ${row("Quantità", d.quantityKg != null ? `${d.quantityKg} kg` : "")}
    ${row("Nome", d.name)}
    ${row("Telefono", d.phone)}
    ${row("Email", d.email ?? "")}
    ${row("Note", d.notes ?? "")}
  </table>`;
}

/** Sent to the customer when they submit a reservation. */
export function reservationCustomerEmail(d: ReservationEmailData): Built {
  const heading = "Abbiamo ricevuto la tua richiesta";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(d.name)}, grazie per la tua richiesta di prenotazione. La confermeremo al più presto
      contattandoti ai recapiti che ci hai lasciato. Ecco il riepilogo:
    </p>
    ${reservationDetailTable(d)}
      ${button(absoluteUrl(`/traccia?ref=${encodeURIComponent(d.reference)}`), "Segui lo stato della richiesta")}
    <p style="font-size:13px;line-height:1.7;color:${MUTED};margin:18px 0 0;">
      Conserva il riferimento <strong>${d.reference}</strong>. Per modifiche chiamaci in negozio.
    </p>`;
  return {
    subject: `Richiesta ricevuta · ${d.reference} — Norcineria Taccalite`,
    html: layout({ heading, body, preheader: `Riepilogo della tua prenotazione ${d.reference}` }),
    text:
      `Ciao ${d.name}, abbiamo ricevuto la tua richiesta (${d.reference}).\n` +
      `Tipo: ${TYPE_LABEL[d.type]}\nNegozio: ${d.shopName}\nData: ${fmtDateIt(d.date)}` +
      `${d.time ? ` ${d.time}` : ""}\n${d.guests != null ? `Ospiti: ${d.guests}\n` : ""}` +
      `${d.quantityKg != null ? `Quantità: ${d.quantityKg} kg\n` : ""}` +
      `Ti contatteremo per confermare.\n` +
      `Segui lo stato della richiesta: ${absoluteUrl(`/traccia?ref=${encodeURIComponent(d.reference)}`)}\n` +
      `— Norcineria Taccalite`,
  };
}

export type OrderEmailData = {
  orderNumber: string;
  name: string;
  email: string;
  items: { name: string; quantity: number; lineTotalCents: number }[];
  totalCents: number;
  fulfilment: FulfilmentMode;
  shopName?: string | null;
  /** Chosen pickup window, already formatted ("giovedi 22 agosto - 10:00-12:30"). */
  pickupSlotLabel?: string | null;
};

function euro(cents: number): string {
  return `€ ${(cents / 100).toFixed(2)}`;
}

function orderItemsTable(d: OrderEmailData): string {
  const rows = d.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;font-size:14px;color:#2a1a10;">${i.quantity}× ${esc(i.name)}</td>` +
        `<td style="padding:6px 0;font-size:14px;color:#2a1a10;text-align:right;">${euro(i.lineTotalCents)}</td></tr>`,
    )
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;border-top:1px solid #e6d9c7;">
    <tr>
      <th scope="col" align="left" style="padding:8px 0 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};font-weight:400;">Articolo</th>
      <th scope="col" align="right" style="padding:8px 0 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};font-weight:400;">Totale</th>
    </tr>
    ${rows}
    <tr><td style="padding:10px 0 0;font-weight:700;border-top:1px solid #e6d9c7;">Totale</td>
    <td style="padding:10px 0 0;font-weight:700;text-align:right;border-top:1px solid #e6d9c7;">${euro(d.totalCents)}</td></tr>
  </table>`;
}

/** Order confirmation to the customer. */
export function orderCustomerEmail(d: OrderEmailData): Built {
  // The window is the single most useful line in this email for a pickup — it is
  // the appointment the customer has to keep — so it goes with the method rather
  // than being left to the confirmation page they may never revisit.
  const fulfil =
    d.fulfilment === "pickup"
      ? `Ritiro in bottega${d.shopName ? ` — ${d.shopName}` : ""}${
          d.pickupSlotLabel ? ` · ${d.pickupSlotLabel}` : ""
        }`
      : d.fulfilment === "delivery"
        ? "Consegna a domicilio all'indirizzo indicato"
        : "Spedizione all'indirizzo indicato";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(d.name)}, grazie per il tuo ordine <strong>${esc(d.orderNumber)}</strong>.
    </p>
    ${orderItemsTable(d)}
    <p style="font-size:13px;color:${MUTED};margin:14px 0 0;">${fulfil}</p>`;
  return {
    subject: `Ordine confermato · ${d.orderNumber} — Norcineria Taccalite`,
    html: layout({ heading: "Ordine confermato", body, preheader: `Ordine ${d.orderNumber}` }),
    text:
      `Grazie per il tuo ordine ${d.orderNumber}.\n` +
      d.items.map((i) => `${i.quantity}× ${i.name} — ${euro(i.lineTotalCents)}`).join("\n") +
      `\nTotale: ${euro(d.totalCents)}\n${fulfil}`,
  };
}

/**
 * Confirmation for an order that will be paid when the goods change hands.
 *
 * Deliberately NOT `orderCustomerEmail`: that one says "ordine confermato" next
 * to a total the customer has already been charged. Sending it here would tell
 * someone who has paid nothing that their payment went through, and the shop
 * would have no written record of having asked for the money. The amount to
 * bring is therefore the loudest thing in the message.
 */
export function orderAwaitingPaymentEmail(
  d: OrderEmailData,
  method: "in_store" | "on_delivery",
): Built {
  const where =
    method === "on_delivery"
      ? "al momento della consegna"
      : `al ritiro${d.shopName ? ` presso ${esc(d.shopName)}` : " in bottega"}`;
  const fulfil =
    d.fulfilment === "pickup"
      ? `Ritiro in bottega${d.shopName ? ` — ${d.shopName}` : ""}${
          d.pickupSlotLabel ? ` · ${d.pickupSlotLabel}` : ""
        }`
      : "Consegna a domicilio all'indirizzo indicato";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(d.name)}, abbiamo ricevuto il tuo ordine <strong>${esc(d.orderNumber)}</strong> e lo
      stiamo preparando.
    </p>
    ${orderItemsTable(d)}
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:16px 0 0;padding:14px 16px;background:#f6efe3;border-left:3px solid #e1be64;">
      <strong>Da pagare ${where}: ${euro(d.totalCents)}</strong><br />
      <span style="font-size:13px;color:${MUTED};">Puoi pagare in contanti o con il POS. Nessun addebito è stato effettuato online.</span>
    </p>
    <p style="font-size:13px;color:${MUTED};margin:14px 0 0;">${esc(fulfil)}</p>`;
  return {
    subject: `Ordine ricevuto · ${d.orderNumber} — Norcineria Taccalite`,
    html: layout({
      heading: "Ordine ricevuto",
      body,
      preheader: `Da pagare ${where}: ${euro(d.totalCents)}`,
    }),
    text:
      `Abbiamo ricevuto il tuo ordine ${d.orderNumber}.\n` +
      d.items.map((i) => `${i.quantity}× ${i.name} — ${euro(i.lineTotalCents)}`).join("\n") +
      `\nDa pagare ${method === "on_delivery" ? "alla consegna" : "al ritiro"}: ${euro(d.totalCents)}\n` +
      `Nessun addebito è stato effettuato online.\n${fulfil}`,
  };
}

/**
 * Order notification to the shop owner.
 *
 * `toCollectCents` is set for an order that arrives unpaid: whoever hands the
 * parcel over has to know there is money to take, and the one place they are
 * guaranteed to look is the notification that told them the order exists.
 */
export function orderOwnerEmail(d: OrderEmailData, opts: { toCollectCents?: number } = {}): Built {
  const collect =
    opts.toCollectCents != null
      ? `<p style="font-size:15px;line-height:1.7;color:#41281b;margin:16px 0 0;padding:12px 16px;background:#f6efe3;border-left:3px solid #e1be64;">
      <strong>Da incassare alla consegna: ${euro(opts.toCollectCents)}</strong>
    </p>`
      : "";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Nuovo ordine <strong>${esc(d.orderNumber)}</strong> da ${esc(d.name)} (${esc(d.email)}).
    </p>
    ${orderItemsTable(d)}
    ${collect}
      ${button(absoluteUrl("/admin/orders"), "Apri nel gestionale")}`;
  return {
    subject: `Nuovo ordine · ${d.orderNumber}${opts.toCollectCents != null ? " (da incassare)" : ""}`,
    html: layout({ heading: "Nuovo ordine", body }),
    text:
      `Nuovo ordine ${d.orderNumber} da ${d.name} (${d.email}). Totale ${euro(d.totalCents)}.` +
      (opts.toCollectCents != null ? ` Da incassare: ${euro(opts.toCollectCents)}.` : "") +
      `\n\nApri nel gestionale: ${absoluteUrl("/admin/orders")}`,
  };
}

/**
 * Alert the owner about something wrong with an order's money — a payment that
 * failed after the customer left, or a chargeback opened against a completed
 * one. Both have deadlines attached and neither shows up anywhere the shop
 * looks during a normal day, so they get pushed rather than waited for.
 */
export function paymentIssueOwnerEmail(d: {
  orderNumber: string;
  orderId: string;
  kind: "failed" | "disputed";
  amountCents?: number | null;
  detail?: string | null;
}): Built {
  const disputed = d.kind === "disputed";
  const heading = disputed ? "Pagamento contestato" : "Pagamento non riuscito";
  const lead = disputed
    ? `È stata aperta una contestazione (chargeback) sull'ordine <strong>${esc(d.orderNumber)}</strong>${
        d.amountCents != null ? ` per ${euro(d.amountCents)}` : ""
      }. Stripe applica una scadenza per rispondere con le prove: apri la dashboard Stripe il prima possibile.`
    : `Il pagamento dell'ordine <strong>${esc(d.orderNumber)}</strong> non è andato a buon fine. L'ordine resta in attesa e la merce non è stata consegnata.`;
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">${lead}</p>
    ${d.detail ? `<p style="font-size:13px;color:${MUTED};margin:0 0 16px;">${esc(d.detail)}</p>` : ""}
      ${button(absoluteUrl(`/admin/orders/${d.orderId}`), "Apri l'ordine")}`;
  return {
    subject: `${heading} · ${d.orderNumber}`,
    html: layout({ heading, body }),
    text: `${heading} — ordine ${d.orderNumber}${d.detail ? `. ${d.detail}` : ""}`,
  };
}

/** Saturday porchetta pickup reminder. */
export function porchettaReminderEmail(
  name: string,
  date: string,
  quantityKg?: number | null,
  pickup?: { name: string; address?: string } | null,
): Built {
  const qty = quantityKg != null ? ` (${quantityKg} kg)` : "";
  const whereText = pickup
    ? ` presso ${pickup.name}${pickup.address ? ` (${pickup.address})` : ""}`
    : "";
  const whereHtml = pickup
    ? ` presso ${esc(pickup.name)}${pickup.address ? ` (${esc(pickup.address)})` : ""}`
    : "";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(name)}, ti ricordiamo la tua porchetta${qty} prenotata per <strong>${esc(date)}</strong>.
      Esce calda dal forno il sabato mattina${whereHtml}: ti aspettiamo!
    </p>`;
  return {
    subject: "Promemoria: la tua porchetta del sabato ti aspetta",
    html: layout({ heading: "La porchetta è quasi pronta", body }),
    text: `Ciao ${name}, ti ricordiamo la tua porchetta${qty} prenotata per ${date}. Ti aspettiamo${whereText}!`,
  };
}

/**
 * HTML → the plain-text part, for a body this module did not write.
 *
 * Every other template writes its two parts by hand. The newsletter cannot: its
 * body is composed in the gestionale, so the text part has to be derived — and
 * `replace(/<[^>]+>/g, "")` derived it badly. It ran paragraphs together into
 * one line, left `&amp;` and `&nbsp;` sitting there as literals, and dropped
 * every link, so a message whose whole point was "here is the new opening time,
 * book here" arrived as prose with nothing to act on.
 *
 * Links keep their destination in the form most mail readers linkify. Block
 * elements become blank lines, `<br>` a single one, and runs of three or more
 * are collapsed so an airy body doesn't arrive full of holes.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      // A link whose text is already the URL doesn't want it twice.
      return !text || text === href ? href : `${text} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    // A list is one block: its items want single breaks between them, not the
    // blank line every other block element earns.
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|blockquote|ul|ol)>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    // `&amp;` last of the named ones, so "&amp;lt;" decodes to "&lt;" and not to
    // "<" — the usual double-decode trap.
    .replace(/&nbsp;/gi, " ")
    .replace(/&(?:mdash|ndash);/gi, "—")
    .replace(/&(?:lsquo|rsquo|#8217);/gi, "'")
    .replace(/&(?:ldquo|rdquo);/gi, '"')
    .replace(/&hellip;/gi, "…")
    // The vowels an Italian body actually carries, for a composer who pasted
    // from a word processor rather than typing into the box. Grave and acute
    // are separate accents and not interchangeable here — "perché" takes the
    // acute, and rendering it "perchè" is a spelling mistake, not a near miss.
    .replace(/&([aeiouAEIOU])(grave|acute);/g, (_m, v: string, accent: string) => {
      const grave: Record<string, string> = { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù" };
      const acute: Record<string, string> = { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" };
      return (accent === "acute" ? acute : grave)[v] ?? _m;
    })
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/gi, "&")
    // The source is indented markup, and that indentation is an artefact of how
    // it was written, not something the reader asked for: without this the
    // second and later lines of a composed body arrive stepped in by however
    // many spaces the HTML happened to carry.
    .replace(/^[ \t]+/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Newsletter broadcast wrapper (admin-composed). */
export function newsletterBroadcast(subject: string, bodyHtml: string, unsubUrl: string): Built {
  const notice =
    "Ricevi questa email perché ti sei iscritto agli aggiornamenti di Norcineria Taccalite.";
  const body = `${bodyHtml}
    <p style="font-size:11px;color:${MUTED};margin:24px 0 0;">
      ${notice}
      <a href="${unsubUrl}" style="color:${MUTED};">Annulla iscrizione</a>.
    </p>`;
  return {
    subject,
    html: layout({ heading: subject, body, preheader: subject }),
    // The unsubscribe link was added to `body`, not `bodyHtml`, so the text part
    // never carried one at all — the one link a marketing message must have in
    // both parts.
    text: `${htmlToText(bodyHtml)}\n\n—\n${notice}\nAnnulla iscrizione: ${unsubUrl}`,
  };
}

/** Sent to a new customer after registration. */
export function welcomeEmail(name: string, welcomePoints: number): Built {
  const heading = "Benvenuto nel Club Taccalite";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(name)}, il tuo account è attivo. Ti abbiamo già accreditato
      <strong>${welcomePoints} punti</strong> di benvenuto sulla tua scheda fedeltà.
    </p>
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Presenta la tua scheda in negozio ad ogni acquisto per accumulare punti e riscattare
      i premi del club: taglieri, Verdicchio e la nostra porchetta.
    </p>
      ${button(absoluteUrl("/account"), "Vai alla tua area personale")}`;
  return {
    subject: "Benvenuto nel Club Taccalite",
    html: layout({ heading, body, preheader: `${welcomePoints} punti di benvenuto ti aspettano` }),
    text: `Ciao ${name}, benvenuto nel Club Taccalite! Ti abbiamo accreditato ${welcomePoints} punti di benvenuto. Area personale: ${absoluteUrl("/account")}`,
  };
}

/** Sent when a product the customer asked about is back in stock. */
export function backInStockEmail(productName: string, productSlug: string): Built {
  const heading = "Di nuovo disponibile";
  const url = absoluteUrl(`/negozio/${productSlug}`);
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Buone notizie! <strong>${esc(productName)}</strong> è di nuovo disponibile nel nostro
      negozio online.
    </p>
      ${button(url, "Vai al prodotto")}`;
  return {
    subject: `${productName} è di nuovo disponibile`,
    html: layout({ heading, body, preheader: `${productName} è tornato disponibile` }),
    text: `${productName} è di nuovo disponibile: ${url}`,
  };
}

/** Sent to the customer when the shop confirms or cancels their reservation. */
export function reservationStatusEmail(
  d: ReservationEmailData,
  status: "confirmed" | "cancelled",
): Built {
  const confirmed = status === "confirmed";
  const heading = confirmed ? "La tua prenotazione è confermata" : "Aggiornamento sulla prenotazione";
  const tail = confirmed
    ? ", abbiamo confermato la tua prenotazione. Ti aspettiamo!"
    : ", purtroppo non possiamo accogliere la tua richiesta per la data indicata. Contattaci per trovare un'alternativa.";
  const introText = `Ciao ${d.name}${tail}`;
  const introHtml = `Ciao ${esc(d.name)}${tail}`;
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">${introHtml}</p>
    ${reservationDetailTable(d)}`;
  return {
    subject: `${confirmed ? "Confermata" : "Aggiornamento"} · ${d.reference} — Norcineria Taccalite`,
    html: layout({ heading, body }),
    text: `${introText}\nRiferimento: ${d.reference}`,
  };
}

/** Sent when a customer's balance first crosses one or more reward thresholds. */
/**
 * Sent when the shop marks a redemption handed over, or cancels it.
 *
 * `updateRedemptionStatus` moved the points and the reward stock and told the
 * customer nothing — so somebody who redeemed 200 points saw them come back one
 * day with no explanation, which reads as a bug in the loyalty scheme rather
 * than as a shop that ran out.
 */
export function redemptionStatusEmail(
  name: string,
  rewardName: string,
  status: "fulfilled" | "cancelled",
  points: number,
): Built {
  const done = status === "fulfilled";
  const body = done
    ? `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(name)}, il tuo premio <strong>${esc(rewardName)}</strong> è stato consegnato.
      Grazie per la fedeltà — e buon appetito!
    </p>`
    : `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(name)}, purtroppo non siamo riusciti a consegnarti il premio
      <strong>${esc(rewardName)}</strong>. Ti abbiamo riaccreditato i
      <strong>${points} punti</strong>: puoi usarli subito per un altro premio.
    </p>
      ${button(absoluteUrl("/account"), "Vedi i premi disponibili")}`;
  return {
    subject: done ? "Il tuo premio è stato consegnato" : "Premio non disponibile — punti riaccreditati",
    html: layout({
      heading: done ? "Premio consegnato" : "Punti riaccreditati",
      body,
      preheader: done ? esc(rewardName) : `${points} punti tornati sulla tua tessera`,
    }),
    text: done
      ? `Ciao ${name}, il tuo premio ${rewardName} è stato consegnato. Grazie!`
      : `Ciao ${name}, non siamo riusciti a consegnarti il premio ${rewardName}. Ti abbiamo riaccreditato ${points} punti.`,
  };
}

export function rewardUnlockedEmail(
  name: string,
  unlocked: { name: string; points: number }[],
  balance: number,
): Built {
  const items = unlocked
    .map(
      (r) =>
        `<li style="margin:0 0 6px;font-size:15px;color:#2a1a10;">${esc(r.name)} — <strong>${r.points} punti</strong></li>`,
    )
    .join("");
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(name)}, ottime notizie! Con <strong>${balance} punti</strong> sulla tua scheda
      fedeltà puoi ora riscattare:
    </p>
    <ul style="padding-left:18px;margin:0 0 16px;">${items}</ul>
      ${button(absoluteUrl("/account"), "Riscatta nel tuo Club")}`;
  return {
    subject: "Hai sbloccato un nuovo premio fedeltà",
    html: layout({ heading: "Un premio ti aspetta", body, preheader: `${balance} punti disponibili` }),
    text:
      `Ciao ${name}, con ${balance} punti puoi riscattare: ` +
      `${unlocked.map((r) => `${r.name} (${r.points} punti)`).join(", ")}. ` +
      `Vai su ${absoluteUrl("/account")}`,
  };
}

/** Newsletter double opt-in confirmation. */
export function newsletterConfirmEmail(confirmUrl: string): Built {
  const heading = "Conferma la tua iscrizione";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Grazie per esserti iscritto agli aggiornamenti di Norcineria Taccalite. Conferma il tuo
      indirizzo per ricevere gli inviti alle degustazioni e l&apos;avviso quando la porchetta del
      sabato esce dal forno.
    </p>
      ${button(confirmUrl, "Conferma iscrizione")}
    <p style="font-size:12px;color:${MUTED};margin:18px 0 0;">Se non sei stato tu, ignora questa email.</p>`;
  return {
    subject: "Conferma la tua iscrizione — Norcineria Taccalite",
    html: layout({ heading, body }),
    text: `Conferma la tua iscrizione alla newsletter Taccalite: ${confirmUrl}`,
  };
}

/**
 * Sent to the customer who cancelled their own booking from the account page.
 *
 * `reservationStatusEmail(d, "cancelled")` says "purtroppo non possiamo
 * accogliere la tua richiesta" — the shop's wording, wrong for a cancellation
 * the customer chose.
 */
export function reservationCancelledByCustomerEmail(d: ReservationEmailData): Built {
  const heading = "Prenotazione annullata";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(d.name)}, come richiesto abbiamo annullato la tua prenotazione. Se cambi idea,
      puoi prenotare di nuovo dal sito o chiamarci in bottega.
    </p>
    ${reservationDetailTable(d)}`;
  return {
    subject: `Annullata · ${d.reference} — Norcineria Taccalite`,
    html: layout({ heading, body }),
    text: `Ciao ${d.name}, come richiesto abbiamo annullato la tua prenotazione.
Riferimento: ${d.reference}`,
  };
}

/** Sent to the shop owner when a customer cancels a booking from their account. */
export function reservationCustomerCancelledOwnerEmail(d: ReservationEmailData): Built {
  const heading = "Prenotazione annullata dal cliente";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      ${esc(d.name)} ha annullato la prenotazione dal proprio account. Dettagli:
    </p>
    ${reservationDetailTable(d)}
      ${button(absoluteUrl("/admin/reservations"), "Apri nel gestionale")}`;
  return {
    subject: `Annullata dal cliente · ${TYPE_LABEL[d.type]} · ${d.reference}`,
    html: layout({ heading, body }),
    text:
      `Prenotazione ${d.reference} annullata dal cliente
Tipo: ${TYPE_LABEL[d.type]}
Nome: ${d.name}
` +
      `Telefono: ${d.phone}
Negozio: ${d.shopName}
Data: ${fmtDateIt(d.date)}${d.time ? ` ${d.time}` : ""}` +
      `\n\nApri nel gestionale: ${absoluteUrl("/admin/reservations")}`,
  };
}

/** Sent to the shop owner when a reservation arrives. */
export function reservationOwnerEmail(d: ReservationEmailData): Built {
  const heading = "Nuova richiesta di prenotazione";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      È arrivata una nuova richiesta dal sito. Dettagli:
    </p>
    ${reservationDetailTable(d)}
      ${button(absoluteUrl("/admin/reservations"), "Apri nel gestionale")}`;
  return {
    subject: `Nuova prenotazione · ${TYPE_LABEL[d.type]} · ${d.reference}`,
    html: layout({ heading, body }),
    text:
      `Nuova richiesta ${d.reference}\nTipo: ${TYPE_LABEL[d.type]}\nNome: ${d.name}\n` +
      `Telefono: ${d.phone}\nEmail: ${d.email ?? "-"}\nNegozio: ${d.shopName}\n` +
      `Data: ${fmtDateIt(d.date)}${d.time ? ` ${d.time}` : ""}\n` +
      `${d.guests != null ? `Ospiti: ${d.guests}\n` : ""}` +
      `${d.quantityKg != null ? `Quantità: ${d.quantityKg} kg\n` : ""}` +
      `Note: ${d.notes ?? "-"}\n\n` +
      `Apri nel gestionale: ${absoluteUrl("/admin/reservations")}`,
  };
}

/** (I1) "Your porchetta is ready for pickup" — sent by the owner from the agenda. */
export function porchettaReadyEmail(
  name: string,
  date: string,
  quantityKg?: number | null,
  pickup?: { name: string; address?: string } | null,
): Built {
  const qty = quantityKg != null ? ` (${quantityKg} kg)` : "";
  const whereText = pickup ? ` da ${pickup.name}${pickup.address ? ` — ${pickup.address}` : ""}` : "";
  const whereHtml = pickup ? ` da ${esc(pickup.name)}${pickup.address ? ` — ${esc(pickup.address)}` : ""}` : "";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(name)}, la tua porchetta${qty} prenotata per <strong>${esc(date)}</strong> è
      <strong>pronta per il ritiro</strong>${whereHtml}. Ti aspettiamo, esce calda dal forno!
    </p>`;
  return {
    subject: "La tua porchetta è pronta per il ritiro",
    html: layout({ heading: "La porchetta è pronta! 🔥", body, preheader: "Passa a ritirarla in bottega" }),
    text: `Ciao ${name}, la tua porchetta${qty} del ${date} è pronta per il ritiro${whereText}. Ti aspettiamo!`,
  };
}

/**
 * Sent from the closures screen when a day the shop is shutting already has
 * bookings on it.
 *
 * Deliberately does NOT announce a cancellation. The booking stays live: what
 * happens to it — moved, refunded, or the customer simply comes another day — is
 * a conversation, and a mass email is the wrong place to decide it. So this says
 * the date is not available and asks them to get in touch.
 */
export function closureNoticeEmail(d: {
  reference: string;
  name: string;
  date: string;
  time: string | null;
  shopName: string;
  reason: string | null;
  /** Set for a partial-day closure: "chiusi dalle 14:00 alle 18:00". */
  startTime?: string | null;
  endTime?: string | null;
}): Built {
  const day = fmtDateIt(d.date);
  const when = `${day}${d.time ? ` alle ${d.time}` : ""}`;
  const hours = d.startTime && d.endTime ? ` dalle ${d.startTime} alle ${d.endTime}` : "";
  const why = d.reason ? ` (${d.reason})` : "";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(d.name)}, ci dispiace: il <strong>${esc(day)}</strong> resteremo chiusi${esc(hours)}${esc(why)},
      quindi non potremo accoglierti come previsto${d.time ? ` alle ${esc(d.time)}` : ""} da ${esc(d.shopName)}.
    </p>
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      La tua prenotazione <strong>${esc(d.reference)}</strong> è ancora registrata: scrivici o
      chiamaci e troviamo insieme un’altra data. Se avevi versato un acconto, te lo
      riconosciamo per intero sulla nuova prenotazione.
    </p>`;
  return {
    subject: `Siamo chiusi il ${day} — spostiamo la tua prenotazione?`,
    html: layout({
      heading: "Cambio di programma",
      body,
      preheader: `La bottega è chiusa il ${day}`,
    }),
    text: `Ciao ${d.name}, il ${when} resteremo chiusi${hours}${why}, quindi non potremo accoglierti da ${d.shopName}.

La tua prenotazione ${d.reference} è ancora registrata: contattaci e troviamo un'altra data. Un eventuale acconto ti viene riconosciuto per intero.`,
  };
}

/**
 * The same notice for a paid order booked into a pickup window on a closed day.
 *
 * Nothing is cancelled here either: the goods are paid for and the shop still
 * owes them. The customer is asked to pick another window, or to get in touch
 * if none suits.
 */
export function closurePickupNoticeEmail(d: {
  orderNumber: string;
  name: string;
  pickupAt: Date;
  shopName: string;
  reason: string | null;
  startTime?: string | null;
  endTime?: string | null;
}): Built {
  const when = fmtPickupIt(d.pickupAt);
  const hours = d.startTime && d.endTime ? ` dalle ${d.startTime} alle ${d.endTime}` : "";
  const why = d.reason ? ` (${d.reason})` : "";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(d.name)}, ci dispiace: il giorno del tuo ritiro (<strong>${esc(when)}</strong>)
      ${esc(d.shopName)} resterà chiusa${esc(hours)}${esc(why)}, quindi non potremo consegnarti l’ordine
      nell’orario che avevi scelto.
    </p>
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      L’ordine <strong>${esc(d.orderNumber)}</strong> è pagato e ti aspetta: rispondi a questa email o
      chiamaci per scegliere un altro orario di ritiro. Se nessuno ti va bene, troviamo insieme la
      soluzione migliore.
    </p>`;
  return {
    subject: `Siamo chiusi il giorno del tuo ritiro — ordine ${d.orderNumber}`,
    html: layout({
      heading: "Cambio di programma",
      body,
      preheader: `${d.shopName} è chiusa ${when}`,
    }),
    text: `Ciao ${d.name}, il giorno del tuo ritiro (${when}) ${d.shopName} resterà chiusa${hours}${why}.

L'ordine ${d.orderNumber} è pagato e ti aspetta: contattaci per scegliere un altro orario di ritiro.`,
  };
}

/**
 * "A domani" for a table booked tomorrow.
 *
 * Porchetta pre-orders have had a reminder since the beginning; table bookings
 * had none, which is the wrong way round — a forgotten porchetta is meat the
 * shop still sells to somebody else, a forgotten table is an empty table for the
 * whole service. Includes the cancellation ask, because the point of the message
 * is to recover the covers when the answer is no.
 */
export function tableReminderEmail(d: {
  reference: string;
  name: string;
  date: string;
  time: string | null;
  guests: number | null;
  shopName: string;
}): Built {
  const when = `${fmtDateIt(d.date)}${d.time ? ` alle ${d.time}` : ""}`;
  const party = d.guests ? ` per ${d.guests} ${d.guests === 1 ? "persona" : "persone"}` : "";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(d.name)}, ti aspettiamo <strong>${esc(when)}</strong>${esc(party)} da
      ${esc(d.shopName)}. Il riferimento della prenotazione è
      <strong>${esc(d.reference)}</strong>.
    </p>
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Se non riesci a venire, faccelo sapere: liberiamo il tavolo per qualcun altro.
    </p>`;
  return {
    subject: `A domani${d.time ? ` alle ${d.time}` : ""} — ${d.shopName}`,
    html: layout({ heading: "Ci vediamo domani", body, preheader: esc(when) }),
    text: `Ciao ${d.name}, ti aspettiamo ${when}${party} da ${d.shopName} (rif. ${d.reference}). Se non riesci a venire, faccelo sapere: liberiamo il tavolo.`,
  };
}

/** (I1) Sent when a porchetta pre-order exceeds the weekly capacity and is waitlisted. */
export function porchettaWaitlistEmail(name: string, date: string, quantityKg?: number | null): Built {
  const qty = quantityKg != null ? ` (${quantityKg} kg)` : "";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(name)}, grazie per la tua richiesta di porchetta${qty} per <strong>${esc(date)}</strong>.
      Per quel sabato abbiamo raggiunto la quantità massima prenotabile, quindi sei in
      <strong>lista d'attesa</strong>: ti contatteremo appena si libera un posto o per proporti
      il sabato successivo.
    </p>`;
  return {
    subject: "Sei in lista d'attesa per la porchetta",
    html: layout({ heading: "Lista d'attesa porchetta", body }),
    text: `Ciao ${name}, la tua porchetta${qty} del ${date} è in lista d'attesa (sabato al completo). Ti contatteremo.`,
  };
}

/** (I3) Low-stock alert to the shop owner. */
export function lowStockOwnerEmail(items: { name: string; stock: number }[]): Built {
  const rows = items
    .map(
      (i) =>
        `<li style="margin:0 0 6px;font-size:15px;color:#2a1a10;">${esc(i.name)} — <strong>${i.stock}</strong> rimasti</li>`,
    )
    .join("");
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Alcuni prodotti stanno per esaurirsi:
    </p>
    <ul style="padding-left:18px;margin:0 0 16px;">${rows}</ul>
      ${button(absoluteUrl("/admin/products"), "Gestisci le scorte")}`;
  return {
    subject: `Scorte in esaurimento · ${items.length} prodott${items.length === 1 ? "o" : "i"}`,
    html: layout({ heading: "Scorte in esaurimento", body }),
    text: `Scorte basse:\n${items.map((i) => `- ${i.name}: ${i.stock} rimasti`).join("\n")}\n${absoluteUrl("/admin/products")}`,
  };
}

export type OwnerDigestData = {
  date: string;
  reservations: { reference: string; type: "table" | "porchetta" | "order"; name: string; time?: string | null; quantityKg?: number | null }[];
  orders: { orderNumber: string; name: string; totalCents: number }[];
  lowStock: { name: string; stock: number }[];
};

/** (I2) Daily digest to the owner: today's reservations + recent orders + low stock. */
export function ownerDigestEmail(d: OwnerDigestData): Built {
  const section = (title: string, inner: string) =>
    `<p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:20px 0 6px;">${title}</p>${inner}`;
  const resHtml = d.reservations.length
    ? `<ul style="padding-left:18px;margin:0;">${d.reservations
        .map(
          (r) =>
            `<li style="margin:0 0 4px;font-size:14px;">${esc(TYPE_LABEL[r.type])} · ${esc(r.name)}${r.time ? ` · ${esc(r.time)}` : ""}${r.quantityKg != null ? ` · ${r.quantityKg} kg` : ""} <span style="color:${MUTED};">(${esc(r.reference)})</span></li>`,
        )
        .join("")}</ul>`
    : `<p style="font-size:14px;color:${MUTED};margin:0;">Nessuna prenotazione per oggi.</p>`;
  const ordHtml = d.orders.length
    ? `<ul style="padding-left:18px;margin:0;">${d.orders
        .map((o) => `<li style="margin:0 0 4px;font-size:14px;">${esc(o.orderNumber)} · ${esc(o.name)} · ${euro(o.totalCents)}</li>`)
        .join("")}</ul>`
    : `<p style="font-size:14px;color:${MUTED};margin:0;">Nessun ordine nelle ultime 24 ore.</p>`;
  const lowHtml = d.lowStock.length
    ? `<ul style="padding-left:18px;margin:0;">${d.lowStock
        .map((p) => `<li style="margin:0 0 4px;font-size:14px;">${esc(p.name)} — ${p.stock} rimasti</li>`)
        .join("")}</ul>`
    : `<p style="font-size:14px;color:${MUTED};margin:0;">Scorte a posto.</p>`;
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 4px;">Riepilogo del ${esc(fmtDateIt(d.date))}.</p>
    ${section("Prenotazioni di oggi", resHtml)}
    ${section("Ordini (ultime 24h)", ordHtml)}
    ${section("Scorte in esaurimento", lowHtml)}
      ${button(absoluteUrl("/admin"), "Apri il gestionale")}`;
  return {
    subject: `Riepilogo giornaliero · ${fmtDateIt(d.date)}`,
    html: layout({ heading: "Il tuo riepilogo", body, preheader: `${d.reservations.length} prenotazioni · ${d.orders.length} ordini` }),
    text:
      `Riepilogo del ${fmtDateIt(d.date)}\n\nPrenotazioni oggi: ${d.reservations.length}\n` +
      d.reservations.map((r) => `- ${TYPE_LABEL[r.type]} ${r.name}${r.time ? ` ${r.time}` : ""} (${r.reference})`).join("\n") +
      `\n\nOrdini 24h: ${d.orders.length}\n` +
      d.orders.map((o) => `- ${o.orderNumber} ${o.name} ${euro(o.totalCents)}`).join("\n") +
      `\n\nScorte basse: ${d.lowStock.map((p) => `${p.name} (${p.stock})`).join(", ") || "nessuna"}`,
  };
}

/** (Batch 2) Order status-change notice to the customer: shipped/fulfilled (with
 *  optional tracking), cancelled, or refunded. */
export function orderStatusEmail(
  d: {
    orderNumber: string;
    name: string;
    fulfilment: FulfilmentMode;
    shopName?: string | null;
    pickupSlotLabel?: string | null;
    carrier?: string | null;
    trackingNumber?: string | null;
    /** Resolved by the caller from the `store.carriers` setting. When present the
     *  tracking number becomes a link; when absent it stays plain text, which is
     *  what every shipment did before carriers were configurable. */
    trackingUrl?: string | null;
    totalCents: number;
    /** Amount actually given back. Defaults to the order total (full refund). */
    refundAmountCents?: number | null;
    /** True when money remains on the order after this refund. */
    partialRefund?: boolean;
  },
  status: "ready" | "fulfilled" | "cancelled" | "refunded",
): Built {
  const euroTot = euro(d.refundAmountCents ?? d.totalCents);
  let heading: string;
  let intro: string;
  let extraHtml = "";
  let extraText = "";

  // "ready" is the moment the customer is told to come (pickup) or to expect
  // the van (delivery); "fulfilled" is the same news for a courier shipment,
  // whose "ready" is the parcel leaving with a tracking number. A pickup or a
  // delivery marked fulfilled is already in the customer's hands and is sent
  // nothing — the copy is kept for both statuses so a re-send still works.
  if (status === "ready" || status === "fulfilled") {
    if (d.fulfilment === "shipping") {
      heading = "Il tuo ordine è in viaggio";
      intro = `il tuo ordine <strong>${esc(d.orderNumber)}</strong> è stato spedito.`;
      if (d.trackingNumber) {
        const carrier = d.carrier ? `${esc(d.carrier)} · ` : "";
        const code = d.trackingUrl
          ? `<a href="${esc(d.trackingUrl)}" style="color:#8a6a2f;">${esc(d.trackingNumber)}</a>`
          : esc(d.trackingNumber);
        extraHtml = `<p style="font-size:15px;color:#41281b;margin:0 0 8px;">Tracking: ${carrier}<strong>${code}</strong></p>`;
        extraText =
          `\nTracking: ${d.carrier ? d.carrier + " " : ""}${d.trackingNumber}` +
          (d.trackingUrl ? `\n${d.trackingUrl}` : "");
      }
    } else if (d.fulfilment === "delivery") {
      // Local delivery is not a shipment (there is no tracking number to give)
      // and not a collection (nobody is coming to the counter). Saying "pronto
      // per il ritiro" to someone waiting at home was the wrong sentence.
      heading = "Il tuo ordine è in consegna";
      intro = `il tuo ordine <strong>${esc(d.orderNumber)}</strong> è partito per la consegna all'indirizzo indicato.`;
    } else {
      heading = "Il tuo ordine è pronto";
      intro =
        `il tuo ordine <strong>${esc(d.orderNumber)}</strong> è pronto per il ritiro${d.shopName ? ` presso ${esc(d.shopName)}` : ""}` +
        `${d.pickupSlotLabel ? ` — ${esc(d.pickupSlotLabel)}` : ""}.`;
    }
  } else if (status === "cancelled") {
    heading = "Ordine annullato";
    intro = `il tuo ordine <strong>${esc(d.orderNumber)}</strong> è stato annullato. Per qualsiasi domanda, rispondi a questa email o chiamaci in bottega.`;
  } else if (d.partialRefund) {
    heading = "Rimborso parziale emesso";
    intro = `abbiamo emesso un rimborso parziale di <strong>${euroTot}</strong> sull'ordine <strong>${esc(d.orderNumber)}</strong> (totale ordine ${euro(d.totalCents)}). L'accredito può richiedere alcuni giorni lavorativi.`;
  } else {
    heading = "Rimborso emesso";
    intro = `abbiamo emesso un rimborso di <strong>${euroTot}</strong> per l'ordine <strong>${esc(d.orderNumber)}</strong>. L'accredito può richiedere alcuni giorni lavorativi.`;
  }

  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">Ciao ${esc(d.name)}, ${intro}</p>
    ${extraHtml}`;
  return {
    subject: `${heading} · ${d.orderNumber} — Norcineria Taccalite`,
    html: layout({ heading, body }),
    text: `Ciao ${d.name}, ${intro.replace(/<[^>]+>/g, "")}${extraText}`,
  };
}

export type ContactEmailData = {
  name: string;
  email: string;
  phone?: string | null;
  topic: string;
  message: string;
};

/**
 * Sent to the shop when someone writes from `/contatti`.
 *
 * `reply-to` isn't part of `MailInput`, so the sender's address is put in the
 * body where the owner can copy it — the alternative was widening the mailer for
 * one caller.
 */
export function contactOwnerEmail(d: ContactEmailData): Built {
  const body = `
    <table width="100%" cellpadding="0" cellspacing="0">
      ${row("Nome", d.name)}
      ${row("Email", d.email)}
      ${row("Telefono", d.phone ?? "")}
      ${row("Motivo", d.topic)}
    </table>
    <p style="margin:22px 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};">Messaggio</p>
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0;white-space:pre-wrap;">${esc(d.message)}</p>
      ${button(`mailto:${esc(d.email)}`, "Rispondi a ${esc(d.name)}")}`;
  return {
    subject: `Nuovo messaggio dal sito — ${d.topic}`,
    html: layout({
      heading: "Nuovo messaggio dal sito",
      body,
      preheader: `${d.name}: ${d.message.slice(0, 90)}`,
    }),
    text: `Nuovo messaggio dal sito\n\nNome: ${d.name}\nEmail: ${d.email}\nTelefono: ${d.phone ?? "—"}\nMotivo: ${d.topic}\n\n${d.message}`,
  };
}

// ── Account: recovery and verification ───────────────────────────────────────

/**
 * The password-reset link.
 *
 * Says how long it lasts and what to do if it wasn't them, because those are
 * the only two questions this email ever raises. It deliberately does NOT name
 * the account's username or any other stored detail: the address may have been
 * typed by someone who is not the owner, and this message must not confirm
 * anything about the account to them beyond its existence.
 */
export function passwordResetEmail(resetUrl: string, minutes: number): Built {
  const heading = "Reimposta la tua password";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Hai chiesto di reimpostare la password del tuo account Taccalite. Il link qui sotto
      resta valido per <strong>${minutes} minuti</strong> e può essere usato una volta sola.
    </p>
      ${button(resetUrl, "Scegli una nuova password")}
    <p style="font-size:12px;color:${MUTED};margin:18px 0 0;">
      Se non sei stato tu, puoi ignorare questa email: la password attuale resta valida e
      nessuno può accedere senza questo link.
    </p>`;
  return {
    subject: "Reimposta la tua password — Norcineria Taccalite",
    html: layout({ heading, body, preheader: `Il link scade tra ${minutes} minuti` }),
    text: `Hai chiesto di reimpostare la password del tuo account Taccalite.\n\nApri questo link entro ${minutes} minuti (valido una volta sola):\n${resetUrl}\n\nSe non sei stato tu, ignora questa email.`,
  };
}

/**
 * Sent *after* a password changes, by any route — reset link, account area, or
 * an admin reset.
 *
 * This is the tripwire. A customer whose account has been taken over learns
 * about it here, and it is the only message in the system whose value lies
 * entirely in being unwanted. Hence the phone number rather than a link: someone
 * who has just lost control of their account should not be asked to click.
 */
export function passwordChangedEmail(name: string, contact: { phone?: string | null }): Built {
  const heading = "La tua password è stata cambiata";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(name)}, ti confermiamo che la password del tuo account Taccalite è appena
      stata cambiata. Tutte le sessioni aperte sono state chiuse.
    </p>
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      <strong>Non sei stato tu?</strong> Chiamaci${
        contact.phone ? ` allo ${esc(contact.phone)}` : ""
      } il prima possibile: possiamo bloccare l&apos;account subito.
    </p>`;
  return {
    subject: "La tua password è stata cambiata — Norcineria Taccalite",
    html: layout({ heading, body, preheader: "Se non sei stato tu, contattaci subito" }),
    text: `Ciao ${name}, la password del tuo account Taccalite è appena stata cambiata e tutte le sessioni aperte sono state chiuse.\n\nSe non sei stato tu, chiamaci${contact.phone ? ` allo ${contact.phone}` : ""} il prima possibile.`,
  };
}

/**
 * The address-verification link.
 *
 * `claimable` is the number of past guest orders waiting to be attached to this
 * account once the address is proven. Naming it is what turns a chore into an
 * incentive — "verifica" alone gets ignored, "abbiamo trovato 3 ordini" does not.
 */
export function verifyEmailEmail(verifyUrl: string, name: string, claimable = 0): Built {
  const heading = "Conferma il tuo indirizzo email";
  const claim =
    claimable > 0
      ? `<p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Abbiamo trovato <strong>${claimable} ${claimable === 1 ? "ordine" : "ordini"}</strong>
      fatti con questo indirizzo prima che creassi l&apos;account: confermando li ritrovi
      nella tua area personale, con i punti fedeltà che ti spettano.
    </p>`
      : "";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(name)}, confermaci che questo indirizzo è tuo. Serve a ritrovare i tuoi
      ordini e a rimettere in piedi l&apos;accesso se un giorno dimentichi la password.
    </p>
    ${claim}
      ${button(verifyUrl, "Conferma il mio indirizzo")}
    <p style="font-size:12px;color:${MUTED};margin:18px 0 0;">
      Il link resta valido 24 ore. Se non hai creato tu questo account, ignora questa email.
    </p>`;
  return {
    subject: "Conferma il tuo indirizzo — Norcineria Taccalite",
    html: layout({
      heading,
      body,
      preheader: claimable > 0 ? `${claimable} ordini ti aspettano` : "Bastano pochi secondi",
    }),
    text: `Ciao ${name}, conferma il tuo indirizzo email per il tuo account Taccalite${claimable > 0 ? ` e ritrova i ${claimable} ordini fatti con questo indirizzo` : ""}.\n\n${verifyUrl}\n\nIl link resta valido 24 ore.`,
  };
}

/** Sent once past guest orders have actually been attached to an account. */
export function ordersClaimedEmail(name: string, count: number, points: number): Built {
  const heading = "Abbiamo ritrovato i tuoi ordini";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${esc(name)}, abbiamo collegato al tuo account
      <strong>${count} ${count === 1 ? "ordine" : "ordini"}</strong> fatti con il tuo indirizzo
      prima che lo creassi.${
        points > 0
          ? ` Ti abbiamo accreditato <strong>${points} punti</strong> fedeltà per quegli acquisti.`
          : ""
      }
    </p>
      ${button(absoluteUrl("/account"), "Vedi i tuoi ordini")}`;
  return {
    subject: "Abbiamo ritrovato i tuoi ordini — Norcineria Taccalite",
    html: layout({
      heading,
      body,
      preheader: points > 0 ? `${points} punti accreditati` : `${count} ordini collegati`,
    }),
    text: `Ciao ${name}, abbiamo collegato ${count} ordini al tuo account Taccalite${points > 0 ? ` e accreditato ${points} punti fedeltà` : ""}. Area personale: ${absoluteUrl("/account")}`,
  };
}
