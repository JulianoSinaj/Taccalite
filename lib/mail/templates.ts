import { siteConfig, absoluteUrl } from "@/lib/site";

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
  // `label` is a hard-coded constant; `value` is often user-supplied → escape it.
  return `<tr>
    <td style="padding:8px 0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#807868;width:150px;vertical-align:top;">${label}</td>
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
      Ciao ${esc(d.name)}, grazie per la tua richiesta di prenotazione. La confermeremo al più presto
      contattandoti ai recapiti che ci hai lasciato. Ecco il riepilogo:
    </p>
    ${reservationDetailTable(d)}
    <p style="margin:20px 0 0;">
      <a href="${absoluteUrl(`/traccia?ref=${encodeURIComponent(d.reference)}`)}" style="display:inline-block;background:#e1be64;color:#2a1a10;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;">Segui lo stato della richiesta</a>
    </p>
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
        `<tr><td style="padding:6px 0;font-size:14px;color:#2a1a10;">${i.quantity}× ${esc(i.name)}</td>` +
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
      Ciao ${esc(d.name)}, grazie per il tuo ordine <strong>${esc(d.orderNumber)}</strong>.
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
      Nuovo ordine <strong>${esc(d.orderNumber)}</strong> da ${esc(d.name)} (${esc(d.email)}).
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
      Ciao ${esc(name)}, il tuo account è attivo. Ti abbiamo già accreditato
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
    <p style="margin:22px 0 0;">
      <a href="${absoluteUrl("/account")}" style="display:inline-block;background:#e1be64;color:#2a1a10;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;">Riscatta nel tuo Club</a>
    </p>`;
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
    <p style="margin:20px 0 0;">
      <a href="${absoluteUrl("/admin/products")}" style="display:inline-block;background:#e1be64;color:#2a1a10;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;">Gestisci le scorte</a>
    </p>`;
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
    `<p style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#807868;margin:20px 0 6px;">${title}</p>${inner}`;
  const resHtml = d.reservations.length
    ? `<ul style="padding-left:18px;margin:0;">${d.reservations
        .map(
          (r) =>
            `<li style="margin:0 0 4px;font-size:14px;">${esc(TYPE_LABEL[r.type])} · ${esc(r.name)}${r.time ? ` · ${esc(r.time)}` : ""}${r.quantityKg != null ? ` · ${r.quantityKg} kg` : ""} <span style="color:#807868;">(${esc(r.reference)})</span></li>`,
        )
        .join("")}</ul>`
    : `<p style="font-size:14px;color:#807868;margin:0;">Nessuna prenotazione per oggi.</p>`;
  const ordHtml = d.orders.length
    ? `<ul style="padding-left:18px;margin:0;">${d.orders
        .map((o) => `<li style="margin:0 0 4px;font-size:14px;">${esc(o.orderNumber)} · ${esc(o.name)} · ${euro(o.totalCents)}</li>`)
        .join("")}</ul>`
    : `<p style="font-size:14px;color:#807868;margin:0;">Nessun ordine nelle ultime 24 ore.</p>`;
  const lowHtml = d.lowStock.length
    ? `<ul style="padding-left:18px;margin:0;">${d.lowStock
        .map((p) => `<li style="margin:0 0 4px;font-size:14px;">${esc(p.name)} — ${p.stock} rimasti</li>`)
        .join("")}</ul>`
    : `<p style="font-size:14px;color:#807868;margin:0;">Scorte a posto.</p>`;
  const body = `
    <p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 4px;">Riepilogo del ${esc(d.date)}.</p>
    ${section("Prenotazioni di oggi", resHtml)}
    ${section("Ordini (ultime 24h)", ordHtml)}
    ${section("Scorte in esaurimento", lowHtml)}
    <p style="margin:22px 0 0;">
      <a href="${absoluteUrl("/admin")}" style="display:inline-block;background:#e1be64;color:#2a1a10;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;">Apri il gestionale</a>
    </p>`;
  return {
    subject: `Riepilogo giornaliero · ${d.date}`,
    html: layout({ heading: "Il tuo riepilogo", body, preheader: `${d.reservations.length} prenotazioni · ${d.orders.length} ordini` }),
    text:
      `Riepilogo del ${d.date}\n\nPrenotazioni oggi: ${d.reservations.length}\n` +
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
    fulfilment: "pickup" | "shipping";
    shopName?: string | null;
    carrier?: string | null;
    trackingNumber?: string | null;
    totalCents: number;
  },
  status: "fulfilled" | "cancelled" | "refunded",
): Built {
  const euroTot = euro(d.totalCents);
  let heading: string;
  let intro: string;
  let extraHtml = "";
  let extraText = "";

  if (status === "fulfilled") {
    if (d.fulfilment === "shipping") {
      heading = "Il tuo ordine è in viaggio";
      intro = `il tuo ordine <strong>${esc(d.orderNumber)}</strong> è stato spedito.`;
      if (d.trackingNumber) {
        const carrier = d.carrier ? `${esc(d.carrier)} · ` : "";
        extraHtml = `<p style="font-size:15px;color:#41281b;margin:0 0 8px;">Tracking: ${carrier}<strong>${esc(d.trackingNumber)}</strong></p>`;
        extraText = `\nTracking: ${d.carrier ? d.carrier + " " : ""}${d.trackingNumber}`;
      }
    } else {
      heading = "Il tuo ordine è pronto";
      intro = `il tuo ordine <strong>${esc(d.orderNumber)}</strong> è pronto per il ritiro${d.shopName ? ` presso ${esc(d.shopName)}` : ""}.`;
    }
  } else if (status === "cancelled") {
    heading = "Ordine annullato";
    intro = `il tuo ordine <strong>${esc(d.orderNumber)}</strong> è stato annullato. Per qualsiasi domanda, rispondi a questa email o chiamaci in bottega.`;
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
