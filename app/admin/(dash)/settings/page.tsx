import { AdminHeader, Panel, inputCls, labelCls, SubmitButton } from "@/components/admin/ui";
import { getAllSettings } from "@/lib/admin/queries";
import { saveSetting, sendTestEmail } from "@/lib/admin/actions";
import { smtpConfigured, stripeConfigured, env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  const settings = await getAllSettings();

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
          <form action={sendTestEmail} className="mt-4 flex items-end gap-2">
            <div className="flex-1">
              <label className={labelCls}>Invia email di prova a</label>
              <input name="to" type="email" required defaultValue={env.ownerEmail} className={inputCls} />
            </div>
            <SubmitButton tone="dark">Invia prova</SubmitButton>
          </form>
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
        {settings.map((s) => (
          <Panel key={s.key} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <form action={saveSetting} className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="key" value={s.key} />
              <div className="flex-1">
                <label className={labelCls}>{s.key}</label>
                <input name="value" defaultValue={JSON.stringify(s.value)} className={inputCls} />
              </div>
              <SubmitButton tone="dark">Salva</SubmitButton>
            </form>
          </Panel>
        ))}
      </div>
    </div>
  );
}
