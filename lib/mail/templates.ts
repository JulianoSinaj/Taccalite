import { siteConfig, absoluteUrl } from "@/lib/site";

type Built = { subject: string; html: string; text: string };

/** Brand-styled responsive email shell (inline styles for client compatibility). */
function layout(opts: { heading: string; body: string; preheader?: string }): string {
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#efe4d2;font-family:Helvetica,Arial,sans-serif;color:#2a1a10;">
  ${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>` : ""}
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

function row(label: string, value: string): string {
  if (!value) return "";
  return `<tr>
    <td style="padding:8px 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#807868;width:150px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;font-size:15px;color:#2a1a10;">${value}</td>
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
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
    ${row("Riferimento", d.reference)}
    ${row("Tipo", TYPE_LABEL[d.type])}
    ${row("Negozio", d.shopName)}
    ${row("Data", d.date)}
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
      Ciao ${d.name}, grazie per la tua richiesta di prenotazione. La confermeremo al più presto
      contattandoti ai recapiti che ci hai lasciato. Ecco il riepilogo:
    </p>
    ${reservationDetailTable(d)}
    <p style="font-size:13px;line-height:1.7;color:#807868;margin:18px 0 0;">
      Conserva il riferimento <strong>${d.reference}</strong>. Per modifiche chiamaci in negozio.
    </p>`;
  return {
    subject: `Richiesta ricevuta · ${d.reference} — Norcineria Taccalite`,
    html: layout({ heading, body, preheader: `Riepilogo della tua prenotazione ${d.reference}` }),
    text:
      `Ciao ${d.name}, abbiamo ricevuto la tua richiesta (${d.reference}).\n` +
      `Tipo: ${TYPE_LABEL[d.type]}\nNegozio: ${d.shopName}\nData: ${d.date}` +
      `${d.time ? ` ${d.time}` : ""}\n${d.guests != null ? `Ospiti: ${d.guests}\n` : ""}` +
      `${d.quantityKg != null ? `Quantità: ${d.quantityKg} kg\n` : ""}` +
      `Ti contatteremo per confermare. — Norcineria Taccalite`,
  };
}

export type OrderEmailData = {
  orderNumber: string;
  name: string;
  email: string;
  items: { name: string; quantity: number; lineTotalCents: number }[];
  totalCents: number;
  fulfilment: "pickup" | "shipping";
  shopName?: string | null;
};

function euro(cents: number): string {
  return `€ ${(cents / 100).toFixed(2)}`;
}

function orderItemsTable(d: OrderEmailData): string {
  const rows = d.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;font-size:14px;color:#2a1a10;">${i.quantity}× ${i.name}</td>` +
        `<td style="padding:6px 0;font-size:14px;color:#2a1a10;text-align:right;">${euro(i.lineTotalCents)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;border-top:1px solid #e6d9c7;">
    ${rows}
    <tr><td style="padding:10px 0 0;font-weight:700;border-top:1px solid #e6d9c7;">Totale</td>
    <td style="padding:10px 0 0;font-weight:700;text-align:right;border-top:1px solid #e6d9c7;">${euro(d.totalCents)}</td></tr>
  </table>`;
}

/** Order confirmation to the customer. */
export function orderCustomerEmail(d: OrderEmailData): Built {
  const fulfil =
    d.fulfilment === "pickup"
      ? `Ritiro in negozio${d.shopName ? ` — ${d.shopName}` : ""}`
      : "Spedizione all'indirizzo indicato";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${d.name}, grazie per il tuo ordine <strong>${d.orderNumber}</strong>.
    </p>
    ${orderItemsTable(d)}
    <p style="font-size:13px;color:#807868;margin:14px 0 0;">${fulfil}</p>`;
  return {
    subject: `Ordine confermato · ${d.orderNumber} — Norcineria Taccalite`,
    html: layout({ heading: "Ordine confermato", body, preheader: `Ordine ${d.orderNumber}` }),
    text:
      `Grazie per il tuo ordine ${d.orderNumber}.\n` +
      d.items.map((i) => `${i.quantity}× ${i.name} — ${euro(i.lineTotalCents)}`).join("\n") +
      `\nTotale: ${euro(d.totalCents)}\n${fulfil}`,
  };
}

/** Order notification to the shop owner. */
export function orderOwnerEmail(d: OrderEmailData): Built {
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Nuovo ordine <strong>${d.orderNumber}</strong> da ${d.name} (${d.email}).
    </p>
    ${orderItemsTable(d)}
    <p style="margin:20px 0 0;">
      <a href="${absoluteUrl("/admin/orders")}" style="display:inline-block;background:#e1be64;color:#2a1a10;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;">Apri nel gestionale</a>
    </p>`;
  return {
    subject: `Nuovo ordine · ${d.orderNumber}`,
    html: layout({ heading: "Nuovo ordine", body }),
    text: `Nuovo ordine ${d.orderNumber} da ${d.name} (${d.email}). Totale ${euro(d.totalCents)}.`,
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
  const where = pickup
    ? ` presso ${pickup.name}${pickup.address ? ` (${pickup.address})` : ""}`
    : "";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${name}, ti ricordiamo la tua porchetta${qty} prenotata per <strong>${date}</strong>.
      Esce calda dal forno il sabato mattina${where}: ti aspettiamo!
    </p>`;
  return {
    subject: "Promemoria: la tua porchetta del sabato ti aspetta",
    html: layout({ heading: "La porchetta è quasi pronta", body }),
    text: `Ciao ${name}, ti ricordiamo la tua porchetta${qty} prenotata per ${date}. Ti aspettiamo${where}!`,
  };
}

/** Newsletter broadcast wrapper (admin-composed). */
export function newsletterBroadcast(subject: string, bodyHtml: string, unsubUrl: string): Built {
  const body = `${bodyHtml}
    <p style="font-size:11px;color:#807868;margin:24px 0 0;">
      Ricevi questa email perché ti sei iscritto agli aggiornamenti di Norcineria Taccalite.
      <a href="${unsubUrl}" style="color:#807868;">Annulla iscrizione</a>.
    </p>`;
  return {
    subject,
    html: layout({ heading: subject, body }),
    text: bodyHtml.replace(/<[^>]+>/g, ""),
  };
}

/** Sent to a new customer after registration. */
export function welcomeEmail(name: string, welcomePoints: number): Built {
  const heading = "Benvenuto nel Club Taccalite";
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Ciao ${name}, il tuo account è attivo. Ti abbiamo già accreditato
      <strong>${welcomePoints} punti</strong> di benvenuto sulla tua scheda fedeltà.
    </p>
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">
      Presenta la tua scheda in negozio ad ogni acquisto per accumulare punti e riscattare
      i premi del club: taglieri, Verdicchio e la nostra porchetta.
    </p>
    <p style="margin:22px 0 0;">
      <a href="${absoluteUrl("/account")}" style="display:inline-block;background:#e1be64;color:#2a1a10;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;">Vai alla tua area personale</a>
    </p>`;
  return {
    subject: "Benvenuto nel Club Taccalite",
    html: layout({ heading, body, preheader: `${welcomePoints} punti di benvenuto ti aspettano` }),
    text: `Ciao ${name}, benvenuto nel Club Taccalite! Ti abbiamo accreditato ${welcomePoints} punti di benvenuto. Area personale: ${absoluteUrl("/account")}`,
  };
}

/** Sent to the customer when the shop confirms or cancels their reservation. */
export function reservationStatusEmail(
  d: ReservationEmailData,
  status: "confirmed" | "cancelled",
): Built {
  const confirmed = status === "confirmed";
  const heading = confirmed ? "La tua prenotazione è confermata" : "Aggiornamento sulla prenotazione";
  const intro = confirmed
    ? `Ciao ${d.name}, abbiamo confermato la tua prenotazione. Ti aspettiamo!`
    : `Ciao ${d.name}, purtroppo non possiamo accogliere la tua richiesta per la data indicata. Contattaci per trovare un'alternativa.`;
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 16px;">${intro}</p>
    ${reservationDetailTable(d)}`;
  return {
    subject: `${confirmed ? "Confermata" : "Aggiornamento"} · ${d.reference} — Norcineria Taccalite`,
    html: layout({ heading, body }),
    text: `${intro}\nRiferimento: ${d.reference}`,
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
    <p style="margin:22px 0 0;">
      <a href="${confirmUrl}" style="display:inline-block;background:#e1be64;color:#2a1a10;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;">Conferma iscrizione</a>
    </p>
    <p style="font-size:12px;color:#807868;margin:18px 0 0;">Se non sei stato tu, ignora questa email.</p>`;
  return {
    subject: "Conferma la tua iscrizione — Norcineria Taccalite",
    html: layout({ heading, body }),
    text: `Conferma la tua iscrizione alla newsletter Taccalite: ${confirmUrl}`,
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
    <p style="margin:22px 0 0;">
      <a href="${absoluteUrl("/admin/reservations")}" style="display:inline-block;background:#e1be64;color:#2a1a10;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;">Apri nel gestionale</a>
    </p>`;
  return {
    subject: `Nuova prenotazione · ${TYPE_LABEL[d.type]} · ${d.reference}`,
    html: layout({ heading, body }),
    text:
      `Nuova richiesta ${d.reference}\nTipo: ${TYPE_LABEL[d.type]}\nNome: ${d.name}\n` +
      `Telefono: ${d.phone}\nEmail: ${d.email ?? "-"}\nNegozio: ${d.shopName}\n` +
      `Data: ${d.date}${d.time ? ` ${d.time}` : ""}\n` +
      `${d.guests != null ? `Ospiti: ${d.guests}\n` : ""}` +
      `${d.quantityKg != null ? `Quantità: ${d.quantityKg} kg\n` : ""}` +
      `Note: ${d.notes ?? "-"}`,
  };
}
