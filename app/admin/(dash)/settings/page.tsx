import { redirect } from "next/navigation";
import { AdminHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getAllSettings } from "@/lib/admin/queries";
import { saveSetting, sendTestEmail } from "@/lib/admin/actions";
import { isAdmin } from "@/lib/auth/session";
import { smtpConfigured, stripeConfigured, env } from "@/lib/env";

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

type Control = "number" | "boolean" | "day" | "text";

/** Typed settings we know how to render as friendly form fields. Anything not
 *  listed here falls back to the raw JSON editor below. The `value` posted must
 *  round-trip through `saveSetting` (JSON.parse-or-string) so that
 *  `getSetting<number>` / `getSetting<boolean>` keep working. */
const KNOWN: {
  key: string;
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
    key: "porchetta.weeklyCapacityKg",
    label: "Capacità porchetta settimanale (kg)",
    help: "Kg massimi prenotabili per lo stesso sabato. Oltre questa soglia le richieste vanno in lista d'attesa. Imposta 0 per nessun limite.",
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
    label: "Costo di spedizione (centesimi)",
    help: "Costo fisso di spedizione espresso in centesimi (es. 700 = €7,00). Si applica solo agli ordini con spedizione.",
    control: "number",
    default: 700,
    min: 0,
    step: 50,
  },
  {
    key: "store.freeShippingThresholdCents",
    label: "Soglia spedizione gratuita (centesimi)",
    help: "Se il subtotale dell'ordine raggiunge questo valore in centesimi (es. 5000 = €50,00), la spedizione è gratuita. Imposta 0 per disattivare.",
    control: "number",
    default: 0,
    min: 0,
    step: 100,
  },
  {
    key: "loyalty.enabled",
    label: "Programma fedeltà attivo",
    help: "Abilita il programma fedeltà: accredito dei punti sugli ordini pagati e anteprima dei punti al checkout.",
    control: "boolean",
    default: true,
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
    label: "Sede legale",
    help: "Indirizzo della sede legale riportato sui documenti.",
    control: "text",
    default: "",
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

export default async function AdminSettings() {
  // Settings are admin-only (staff are redirected away; nav also hides the link).
  if (!(await isAdmin())) redirect("/admin");
  const settings = await getAllSettings();

  const stored = new Map(settings.map((s) => [s.key, s.value]));
  const knownKeys = new Set(KNOWN.map((k) => k.key));
  const extras = settings.filter((s) => !knownKeys.has(s.key));

  return (
    <div>
      <AdminHeader title="Impostazioni" subtitle="Configurazione della piattaforma" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel>
          <h3 className="font-display text-lg text-brown-950">Email (SMTP)</h3>
          <p className="mt-2 text-sm text-brown-800/70">
            Stato:{" "}
            <span className={smtpConfigured ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
              {smtpConfigured ? "configurato" : "modalità outbox (test)"}
            </span>
          </p>
          <p className="mt-2 text-xs text-brown-800/60">
            Le credenziali SMTP si impostano nelle variabili d&apos;ambiente (<code>.env</code>):
            <code> SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM</code>. Per un test con
            Gmail usa una &laquo;password per le app&raquo;.
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
            <span className={stripeConfigured ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
              {stripeConfigured ? "configurato" : "modalità simulazione"}
            </span>
          </p>
          <p className="mt-2 text-xs text-brown-800/60">
            Imposta <code>STRIPE_SECRET_KEY</code> e <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>{" "}
            (chiavi di test) per abilitare il checkout reale. Senza chiavi, gli ordini vengono
            registrati in modalità simulazione.
          </p>
        </Panel>
      </div>

      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Parametri operativi</h2>
      <div className="space-y-3">
        {KNOWN.map((def) => {
          const value = stored.has(def.key) ? stored.get(def.key) : def.default;
          return (
            <Panel key={def.key}>
              <ActionForm
                action={saveSetting}
                className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <input type="hidden" name="key" value={def.key} />
                <div className="flex-1">
                  <label className={labelCls}>{def.label}</label>
                  <div className="mb-2 font-mono text-[10px] tracking-wide text-brown-800/40">{def.key}</div>
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
