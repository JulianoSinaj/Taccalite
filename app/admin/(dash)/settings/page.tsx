import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, inputCls, labelCls, fmtDateTime } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getAllSettings } from "@/lib/admin/queries";
import { saveSetting, sendTestEmail } from "@/lib/admin/actions";
import { runAutomationNow } from "@/lib/admin/automation-actions";
import { CRON_JOBS, getCronStatus } from "@/lib/automation";
import { isAdmin } from "@/lib/auth/session";
import { stripeConfigured, env } from "@/lib/env";
import { checkMailer } from "@/lib/mail/mailer";
import { simulatedPayments } from "@/lib/payments/config";
import { absoluteUrl } from "@/lib/site";
import { VAT_RATES_BPS, vatRateLabel } from "@/lib/fiscal";
import { DEFAULT_CARRIERS_TEXT } from "@/lib/carriers";
import { InstagramPanel } from "./InstagramPanel";

export const dynamic = "force-dynamic";

// Week days in the stored format (lowercase English, as seeded) with Italian labels.
const DAYS: { value: string; label: string }[] = [
  { value: "monday", label: "Lunedì" },
  { value: "tuesday", label: "Martedì" },
  { value: "wednesday", label: "Mercoledì" },
  { value: "thursday", label: "Giovedì" },
  { value: "friday", label: "Venerdì" },
  { value: "saturday", label: "Sabato" },
  { value: "sunday", label: "Domenica" },
];

type Control = "number" | "boolean" | "day" | "text" | "vat" | "lines";

/** Typed settings we know how to render as friendly form fields. Anything not
 *  listed here falls back to the raw JSON editor below. The `value` posted must
 *  round-trip through `saveSetting` (JSON.parse-or-string) so that
 *  `getSetting<number>` / `getSetting<boolean>` keep working. */
const KNOWN: {
  key: string;
  /** A superseded key still read as a fallback by the code that consumes this
   *  setting. Its stored value seeds the field so a renamed setting doesn't
   *  appear to reset itself; saving writes `key` and leaves the old row alone
   *  (harmless — the consumer prefers the new key once it exists). */
  legacyKey?: string;
  label: string;
  help: string;
  control: Control;
  default: unknown;
  min?: number;
  step?: number;
}[] = [
  {
    key: "loyalty.pointsPerEuro",
    label: "Punti per euro",
    help: "Punti fedeltà accreditati per ogni euro speso negli ordini pagati.",
    control: "number",
    default: 1,
    min: 0,
    step: 0.1,
  },
  {
    key: "loyalty.pointsExpiryDays",
    label: "Scadenza punti (giorni)",
    help: "Giorni di inattività dopo i quali i punti scadono. Imposta 0 per non farli scadere mai.",
    control: "number",
    default: 0,
    min: 0,
    step: 1,
  },
  {
    key: "porchetta.enabled",
    label: "Porchetta del sabato",
    help: "Abilita le prenotazioni della porchetta artigianale.",
    control: "boolean",
    default: true,
  },
  {
    key: "porchetta.day",
    label: "Giorno di ritiro porchetta",
    help: "Giorno della settimana in cui la porchetta è pronta per il ritiro.",
    control: "day",
    default: "saturday",
  },
  {
    key: "porchetta.cutoffDay",
    label: "Giorno di chiusura ordini porchetta",
    help: "Ultimo giorno utile per prenotare la porchetta della settimana.",
    control: "day",
    default: "friday",
  },
  {
    // Renamed from `porchetta.weeklyCapacityKg`, which is what the code has
    // always *read* as a fallback while this page only ever wrote the old key —
    // so the canonical setting was unreachable from the UI, under a label
    // ("settimanale") that contradicted the behaviour. `legacyKey` keeps an
    // existing install showing its real number until it is saved once.
    key: "porchetta.capacityKgPerDay",
    legacyKey: "porchetta.weeklyCapacityKg",
    label: "Capacità porchetta per giorno di ritiro (kg)",
    help: "Kg massimi prenotabili per lo stesso giorno di ritiro, per ogni negozio. Oltre questa soglia le richieste vanno in lista d'attesa. Imposta 0 per nessun limite. Un negozio può avere una capacità propria che ha la precedenza (Negozi → modifica).",
    control: "number",
    default: 0,
    min: 0,
    step: 1,
  },
  {
    key: "reservations.enabled",
    label: "Prenotazioni attive",
    help: "Abilita il modulo prenotazioni (tavolo, porchetta, ordini speciali) sul sito.",
    control: "boolean",
    default: true,
  },
  {
    key: "store.enabled",
    label: "Negozio online attivo",
    help: "Abilita l'acquisto dei prodotti online. Se disattivo, il negozio è di sola consultazione.",
    control: "boolean",
    default: true,
  },
  {
    key: "store.lowStockThreshold",
    label: "Soglia scorte basse",
    help: "Quando le scorte di un prodotto scendono a questo valore o sotto, ricevi un avviso via email.",
    control: "number",
    default: 5,
    min: 0,
    step: 1,
  },
  {
    key: "store.shippingCents",
    label: "Costo di spedizione di riserva (centesimi)",
    help: "Superato dalle zone di spedizione: si applica solo a un CAP che nessuna zona copre (e agli ordini creati prima che le zone esistessero). Le tariffe per zona si impostano in «Ritiri e consegne».",
    control: "number",
    default: 700,
    min: 0,
    step: 50,
  },
  {
    key: "store.freeShippingThresholdCents",
    label: "Soglia spedizione gratuita di riserva (centesimi)",
    help: "Come sopra: vale solo dove nessuna zona copre il CAP. Ogni zona ha la sua soglia «gratis oltre». Imposta 0 per disattivare.",
    control: "number",
    default: 0,
    min: 0,
    step: 100,
  },
  // ── Pagamenti ──
  {
    key: "payments.cardEnabled",
    label: "Pagamento con carta online",
    help: "Offre il pagamento immediato con carta al checkout. Richiede le chiavi Stripe: senza, l'opzione non viene mostrata anche se questa è attiva.",
    control: "boolean",
    default: true,
  },
  {
    key: "payments.inStoreEnabled",
    label: "Pagamento in bottega (ritiro)",
    help: "Permette di ordinare online e pagare al banco al momento del ritiro. L'ordine viene accettato, la merce messa da parte e l'incasso registrato dal gestionale alla consegna.",
    control: "boolean",
    default: true,
  },
  {
    key: "payments.onDeliveryEnabled",
    label: "Contrassegno (consegna a domicilio)",
    help: "Permette di pagare in contanti o con il POS a chi effettua la consegna. Vale solo per le consegne con mezzo proprio, mai per le spedizioni con corriere.",
    control: "boolean",
    default: true,
  },
  {
    key: "payments.onDeliveryMaxCents",
    label: "Tetto contrassegno (centesimi)",
    help: "Sopra questo totale il contrassegno non viene offerto e resta solo la carta — utile per non far girare troppo contante. Imposta 0 per non porre limiti.",
    control: "number",
    default: 0,
    min: 0,
    step: 500,
  },
  {
    key: "orders.abandonedAfterHours",
    label: "Annullamento checkout abbandonati (ore)",
    help: "Dopo quante ore un ordine con carta rimasto non pagato viene annullato in automatico, liberando la coda. Non tocca gli ordini da pagare in bottega o alla consegna. Imposta 0 per disattivare.",
    control: "number",
    default: 24,
    min: 0,
    step: 1,
  },
  {
    key: "orders.autoFulfilPickupDays",
    label: "Chiusura automatica ritiri (giorni)",
    help: "Dopo quanti giorni un ordine da ritiro pagato viene segnato come evaso in automatico. Imposta 0 per chiuderli sempre a mano. Non tocca le consegne a domicilio: quelle le chiude chi guida.",
    control: "number",
    default: 0,
    min: 0,
    step: 1,
  },
  {
    key: "store.carriers",
    label: "Corrieri",
    help: "Un corriere per riga. Aggiungi «| indirizzo di tracking» per rendere cliccabile il numero di spedizione nell'email al cliente e nella pagina «Traccia» — usa {codice} al posto del numero (es. «BRT | https://esempio.it/track?n={codice}»). L'indirizzo è facoltativo: senza, il numero resta solo testo.",
    control: "lines",
    default: DEFAULT_CARRIERS_TEXT,
  },
  {
    key: "store.shippingVatRate",
    label: "Aliquota IVA sulla spedizione",
    help: "Aliquota applicata al costo di spedizione nel riepilogo IVA, nel dettaglio ordine e nella fattura elettronica.",
    control: "vat",
    default: 22,
  },
  {
    key: "loyalty.enabled",
    label: "Programma fedeltà attivo",
    help: "Abilita il programma fedeltà: accredito dei punti sugli ordini pagati e anteprima dei punti al checkout.",
    control: "boolean",
    default: true,
  },
  {
    // Read by `runMaintenance` since audit retention shipped, and absent from
    // this list — so the one control over how long the activity log survives
    // was reachable only through the raw JSON editor at the bottom of the page.
    key: "audit.retentionDays",
    label: "Conservazione registro attività (giorni)",
    help: "Dopo quanti giorni le voci del registro attività vengono eliminate dalla manutenzione automatica. 730 giorni (due anni) coprono le domande fiscali a cui il registro serve a rispondere. Imposta 0 per non eliminare mai nulla.",
    control: "number",
    default: 730,
    min: 0,
    step: 30,
  },
  {
    // Same story: read by `runMaintenance`, never editable here.
    key: "analytics.retentionDays",
    label: "Conservazione statistiche visite (giorni)",
    help: "Dopo quanti giorni le visite registrate vengono eliminate. Sono dati senza cookie e senza informazioni personali, ma la tabella cresce all'infinito se non si pota. Imposta 0 per conservarle per sempre.",
    control: "number",
    default: 365,
    min: 0,
    step: 30,
  },
  // ── Sito pubblico ──
  {
    key: "home.today",
    label: "Oggi al banco",
    help: "La riga che scorre sotto l'apertura della homepage: cosa c'è di fresco oggi, separato da virgola (es. «Porchetta calda, Vincisgrassi, Ricotta di giornata»). Svuota il campo per nascondere la fascia.",
    control: "text",
    default: "",
  },
  {
    key: "home.brands",
    label: "Marche in homepage",
    help: "I nomi che scorrono nella fascia «Le marche che scegliamo», separati da virgola. Svuota il campo per nascondere la fascia.",
    control: "text",
    default: "Rineri, San Cesario, SIGI, Menchi, Villani",
  },
  // ── Dati fiscali (intestazione documenti / riepilogo IVA) ──
  {
    key: "business.legalName",
    label: "Ragione sociale",
    help: "Denominazione dell'attività così come compare su documenti e riepiloghi fiscali.",
    control: "text",
    default: "Norcineria Taccalite",
  },
  {
    key: "business.vatNumber",
    label: "Partita IVA",
    help: "Partita IVA dell'attività (11 cifre).",
    control: "text",
    default: "",
  },
  {
    key: "business.taxCode",
    label: "Codice Fiscale",
    help: "Codice fiscale dell'attività o del titolare.",
    control: "text",
    default: "",
  },
  {
    key: "business.address",
    label: "Sede legale — indirizzo",
    help: "Via e numero civico della sede legale (per la fattura elettronica).",
    control: "text",
    default: "",
  },
  {
    key: "business.zip",
    label: "Sede legale — CAP",
    help: "CAP della sede legale (5 cifre).",
    control: "text",
    default: "60121",
  },
  {
    key: "business.city",
    label: "Sede legale — Comune",
    help: "Comune della sede legale.",
    control: "text",
    default: "Ancona",
  },
  {
    key: "business.province",
    label: "Sede legale — Provincia",
    help: "Sigla provincia (es. AN).",
    control: "text",
    default: "AN",
  },
  {
    key: "business.rea",
    label: "REA / Registro imprese",
    help: "Numero di iscrizione al Registro delle Imprese (REA), se applicabile.",
    control: "text",
    default: "",
  },
  {
    key: "business.regime",
    label: "Regime fiscale",
    help: "Regime fiscale (es. Ordinario, Forfettario) indicato in fattura.",
    control: "text",
    default: "Ordinario",
  },
];

function SettingField({
  def,
  value,
}: {
  def: (typeof KNOWN)[number];
  value: unknown;
}) {
  if (def.control === "boolean") {
    const checked = value === true;
    return (
      // Hidden field posts "false" by default; when the checkbox is checked it
      // posts "true" AFTER it, and parseForm keeps the last value for a repeated
      // name — so no client JS is needed and the value round-trips as a boolean.
      <label className="inline-flex items-center gap-3">
        <input type="hidden" name="value" value="false" />
        <input
          type="checkbox"
          name="value"
          value="true"
          defaultChecked={checked}
          className="h-5 w-5 rounded border-brown-900/25 text-gold-dark focus:ring-gold-dark focus:ring-offset-0"
        />
        <span className="text-sm text-brown-800">Attivo</span>
      </label>
    );
  }
  if (def.control === "text") {
    const current = typeof value === "string" ? value : value == null ? String(def.default) : String(value);
    return (
      <>
        <input type="hidden" name="valueType" value="text" />
        <input type="text" name="value" defaultValue={current} className={`${inputCls} max-w-md`} />
      </>
    );
  }
  if (def.control === "lines") {
    // Stored verbatim as a multi-line string, like `home.brands` — the value is
    // parsed by the module that consumes it, not by the generic save action.
    const current = typeof value === "string" ? value : value == null ? String(def.default) : String(value);
    return (
      <>
        <input type="hidden" name="valueType" value="text" />
        <textarea
          name="value"
          rows={6}
          defaultValue={current}
          spellCheck={false}
          className={`${inputCls} max-w-md font-mono text-xs`}
        />
      </>
    );
  }
  if (def.control === "vat") {
    // Stored as a whole percent (22), rendered from the canonical bps rates.
    const current = typeof value === "number" ? value : Number(def.default);
    return (
      <select name="value" defaultValue={String(current)} className={`${inputCls} max-w-xs`}>
        {VAT_RATES_BPS.map((bps) => (
          <option key={bps} value={String(bps / 100)}>
            {vatRateLabel(bps)}
          </option>
        ))}
      </select>
    );
  }
  if (def.control === "day") {
    const current = typeof value === "string" ? value : String(def.default);
    return (
      <select name="value" defaultValue={current} className={`${inputCls} max-w-xs`}>
        {DAYS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
    );
  }
  // number
  const current = typeof value === "number" ? value : Number(def.default);
  return (
    <input
      type="number"
      name="value"
      required
      min={def.min}
      step={def.step ?? 1}
      defaultValue={String(current)}
      className={`${inputCls} max-w-xs`}
    />
  );
}

/**
 * The SMTP status, streamed in separately.
 *
 * `checkMailer()` opens a real connection and waits up to CHECK_TIMEOUT_MS for
 * the relay to answer. Awaited in the page body — even inside the `Promise.all`
 * — that made the *whole* settings page take as long as the slowest thing on
 * it: measured at 5.0s against a misconfigured relay, on a page whose other 30
 * panels were ready in ~40ms. The one panel that has to wait now waits alone.
 *
 * It never throws: a dead mail server must not take the settings page down.
 */
async function MailerStatus() {
  const mailer = await checkMailer();

  return (
    <>
      {/* The status used to read "configurato" whenever SMTP_HOST was
          non-empty, which says nothing about whether the credentials work —
          a mistyped password showed green while every message silently
          failed. `checkMailer()` opens the connection, so this reports what
          the server says.

          The remaining trap is subtler and had to be split out: with
          SMTP_USER blank, nodemailer never issues AUTH, so `verify()`
          resolves against a relay that rejects every real message. That is
          not "connesso e autenticato" — it is connected and anonymous, and
          it gets its own amber state rather than a green one. */}
      <p className="mt-2 text-sm text-brown-800/70">
        Stato:{" "}
        {!mailer.configured ? (
          <span className="font-semibold text-warn">modalità outbox (non configurato)</span>
        ) : !mailer.ok ? (
          <span className="font-semibold text-danger">configurato ma non funzionante</span>
        ) : mailer.authenticated ? (
          <span className="font-semibold text-ok">connesso e autenticato</span>
        ) : (
          <span className="font-semibold text-warn">connesso ma senza credenziali</span>
        )}
      </p>
      {mailer.configured && !mailer.ok && (
        <p className="mt-2 border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger-soft-fg">
          Il server di posta ha risposto: <code className="break-all">{mailer.error}</code>
        </p>
      )}
      {mailer.ok && !mailer.authenticated && (
        <p className="mt-2 border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn-soft-fg">
          <strong className="font-semibold">
            Il server risponde, ma non stiamo effettuando l&apos;accesso:
          </strong>{" "}
          <code>SMTP_USER</code> o <code>SMTP_PASS</code>{" "}
          sono vuoti. Quasi tutti i relay
          (Brevo compreso) rifiutano l&apos;invio senza autenticazione con{" "}
          <code>502 Please authenticate first</code>, quindi le email risultano inviate qui e
          non partono. Compila le due variabili e riavvia.
        </p>
      )}
      {!mailer.configured && (
        <p className="mt-2 border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn-soft-fg">
          Nessuna email parte davvero: conferme d&apos;ordine, prenotazioni e i link per
          reimpostare la password restano in coda nell&apos;outbox. Finché resta così, un
          cliente che dimentica la password non può rientrare da solo.
        </p>
      )}
    </>
  );
}

/** Shown while the relay is being probed. Says what is happening rather than
 *  guessing an outcome — an optimistic placeholder here would be the same lie
 *  this panel exists to stop telling. */
function MailerStatusPending() {
  return (
    <p className="mt-2 text-sm text-brown-800/70">
      Stato: <span className="font-semibold text-brown-800/50">verifica in corso…</span>
    </p>
  );
}

export default async function AdminSettings() {
  // Settings are admin-only (staff are redirected away; nav also hides the link).
  if (!(await isAdmin())) redirect("/admin");
  const [settings, cronStatus] = await Promise.all([getAllSettings(), getCronStatus()]);

  const stored = new Map(settings.map((s) => [s.key, s.value]));
  // Superseded keys count as known too, so a renamed setting doesn't reappear in
  // the raw JSON editor as a second, editable copy of the field above it.
  const knownKeys = new Set(KNOWN.flatMap((k) => (k.legacyKey ? [k.key, k.legacyKey] : [k.key])));
  // Keys owned by a dedicated panel (Instagram token/cache) never surface in the
  // raw JSON editor — the token is a secret and the cache blob is not editable.
  // Two classes of key never belong in the raw JSON editor:
  //  - Instagram token/cache: the token is a secret, the cache is not editable;
  //    both are owned by the dedicated panel.
  //  - Cron bookkeeping: machine state, not configuration. As free text an
  //    admin could corrupt the digest idempotency marker or fake a run record.
  const isInternal = (key: string) =>
    key.startsWith("instagram.") || key.startsWith("cron.") || key === "digest.lastSentDate";
  const extras = settings.filter((s) => !knownKeys.has(s.key) && !isInternal(s.key));

  return (
    <div>
      <AdminHeader title="Impostazioni" subtitle="Configurazione della piattaforma" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel>
          <h3 className="font-display text-lg text-brown-950">Email (SMTP)</h3>
          <Suspense fallback={<MailerStatusPending />}>
            <MailerStatus />
          </Suspense>
          <p className="mt-2 text-xs text-brown-800/60">
            Le credenziali SMTP si impostano nelle variabili d&apos;ambiente (<code>.env</code>):
            <code> SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_FROM</code>.
            Dopo averle cambiate riavvia l&apos;applicazione: vengono lette all&apos;avvio.
          </p>
          <ActionForm action={sendTestEmail} className="mt-4 flex items-end gap-2">
            <div className="flex-1">
              <label className={labelCls}>Invia email di prova a</label>
              <input name="to" type="email" required defaultValue={env.ownerEmail} className={inputCls} />
            </div>
            <PendingButton tone="dark">Invia prova</PendingButton>
          </ActionForm>
        </Panel>

        <Panel>
          <h3 className="font-display text-lg text-brown-950">Pagamenti (Stripe)</h3>
          <p className="mt-2 text-sm text-brown-800/70">
            Stato:{" "}
            <span
              className={
                stripeConfigured
                  ? "font-semibold text-ok"
                  : simulatedPayments
                    ? "font-semibold text-warn"
                    : "font-semibold text-danger"
              }
            >
              {stripeConfigured
                ? "configurato"
                : simulatedPayments
                  ? "modalità simulazione (solo sviluppo)"
                  : "non configurato — carta non disponibile"}
            </span>
          </p>
          {/* The distinction that matters: with no keys in production the card
              option disappears rather than quietly marking orders paid. Saying
              so here is the difference between a warning and a silent hole. */}
          <p className="mt-2 text-xs text-brown-800/60">
            {stripeConfigured
              ? "Il checkout con carta è attivo. Registra il webhook su Stripe (Sviluppatori → Webhook) puntandolo a "
              : simulatedPayments
                ? "Senza chiavi, in sviluppo gli ordini con carta vengono segnati come pagati senza alcun addebito, per poter provare l'intero ciclo offline. In produzione questo non accade: il pagamento con carta viene semplicemente nascosto. Endpoint del webhook: "
                : "Senza chiavi il pagamento con carta non viene offerto al checkout: restano il pagamento in bottega e il contrassegno. Imposta STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET, poi registra il webhook su "}
            <code>{absoluteUrl("/api/checkout/webhook")}</code>.
          </p>
          <p className="mt-2 text-xs text-brown-800/60">
            Eventi da sottoscrivere: <code>checkout.session.completed</code>,{" "}
            <code>checkout.session.async_payment_succeeded</code>,{" "}
            <code>checkout.session.async_payment_failed</code>,{" "}
            <code>checkout.session.expired</code>, <code>charge.refunded</code>,{" "}
            <code>charge.dispute.created</code>.
          </p>
          <p className="mt-2 text-xs text-brown-800/60">
            Webhook: <strong>{env.stripe.webhookSecret ? "segreto impostato" : "segreto mancante"}</strong>
            {!env.stripe.webhookSecret &&
              " — senza STRIPE_WEBHOOK_SECRET gli aggiornamenti da Stripe (pagamenti differiti, rimborsi dalla dashboard, contestazioni) non arrivano."}
          </p>
        </Panel>
      </div>

      <h2 className="font-display mt-10 mb-1 text-xl text-brown-950">Automazioni</h2>
      <p className="mb-3 text-xs text-brown-800/60">
        Girano da sole se lo scheduler chiama <code>/api/cron?job=all</code>. Qui vedi quando
        ognuna ha lavorato l&apos;ultima volta e puoi lanciarla subito.
      </p>
      <div className="space-y-3">
        {CRON_JOBS.map((job) => {
          const last = cronStatus[job.key];
          return (
            <Panel key={job.key} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <p className="font-semibold text-brown-950">
                  {job.label}{" "}
                  {last && !last.ok && (
                    <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 uppercase">
                      Errore
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-brown-800/60">{job.description}</p>
                <p className="mt-1 text-xs text-brown-800/50">
                  {last
                    ? `Ultima esecuzione: ${fmtDateTime(last.at)}${last.ok ? "" : ` — ${last.error}`}`
                    : "Mai eseguita."}
                </p>
              </div>
              <ActionForm action={runAutomationNow} className="shrink-0">
                <input type="hidden" name="job" value={job.key} />
                <PendingButton tone="dark">Esegui ora</PendingButton>
              </ActionForm>
            </Panel>
          );
        })}
      </div>

      <div className="mt-6">
        <InstagramPanel />
      </div>

      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Parametri operativi</h2>
      <div className="space-y-3">
        {KNOWN.map((def) => {
          const value = stored.has(def.key)
            ? stored.get(def.key)
            : def.legacyKey && stored.has(def.legacyKey)
              ? stored.get(def.legacyKey)
              : def.default;
          return (
            <Panel key={def.key}>
              <ActionForm
                action={saveSetting}
                className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <input type="hidden" name="key" value={def.key} />
                <div className="flex-1">
                  <label className={labelCls}>{def.label}</label>
                  <div className="mb-2 font-mono text-[11px] tracking-wide text-brown-800/40">{def.key}</div>
                  <SettingField def={def} value={value} />
                  <p className="mt-2 text-xs text-brown-800/60">{def.help}</p>
                </div>
                <div className="sm:pt-6">
                  <PendingButton tone="dark">Salva</PendingButton>
                </div>
              </ActionForm>
            </Panel>
          );
        })}
      </div>

      {extras.length > 0 && (
        <>
          <h2 className="font-display mt-10 mb-1 text-xl text-brown-950">Altri parametri</h2>
          <p className="mb-3 text-xs text-brown-800/60">
            Impostazioni avanzate: modifica il valore in formato JSON (es. <code>true</code>,{" "}
            <code>42</code>, <code>&quot;testo&quot;</code>).
          </p>
          <div className="space-y-3">
            {extras.map((s) => (
              <Panel key={s.key} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <ActionForm action={saveSetting} className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
                  <input type="hidden" name="key" value={s.key} />
                  <div className="flex-1">
                    <label className={labelCls}>{s.key}</label>
                    <input name="value" defaultValue={JSON.stringify(s.value)} className={inputCls} />
                  </div>
                  <PendingButton tone="dark">Salva</PendingButton>
                </ActionForm>
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
