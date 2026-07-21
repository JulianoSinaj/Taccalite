import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { AdminHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, PendingButton, DeleteForm } from "@/components/admin/ActionForm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { generateTotpSecret, otpauthUri } from "@/lib/auth/totp";
import { confirmTotp, disableTotp } from "@/lib/admin/security-actions";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const actor = await requireAdmin();
  let [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);

  // If not yet enrolled, mint (and persist) a pending secret so the QR is stable
  // across reloads until the user confirms or disables.
  if (user && !user.totpEnabled && !user.totpSecret) {
    const secret = generateTotpSecret();
    await db.update(users).set({ totpSecret: secret }).where(eq(users.id, actor.id));
    user = { ...user, totpSecret: secret };
  }

  const enabled = !!user?.totpEnabled;
  const uri = user?.totpSecret ? otpauthUri(user.totpSecret, user.username) : "";
  const qrDataUrl = uri ? await QRCode.toDataURL(uri, { margin: 1, width: 220 }) : "";

  return (
    <div>
      <AdminHeader title="Sicurezza" subtitle="Verifica in due passaggi (2FA) per il tuo account" />

      {enabled ? (
        <Panel className="max-w-xl">
          <p className="text-sm font-semibold text-emerald-700">✓ La verifica in due passaggi è attiva.</p>
          <p className="mt-2 text-sm text-brown-800/70">
            Al prossimo accesso ti verrà chiesto il codice a 6 cifre dalla tua app di autenticazione.
          </p>
          <div className="mt-4">
            <DeleteForm
              action={disableTotp}
              id={actor.id}
              confirm="Disattivare la verifica in due passaggi? Il tuo account sarà protetto dalla sola password."
            >
              Disattiva 2FA
            </DeleteForm>
          </div>
        </Panel>
      ) : (
        <Panel className="max-w-xl">
          <h3 className="font-display text-lg text-brown-950">Attiva la verifica in due passaggi</h3>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-brown-800/80">
            <li>Apri un&apos;app di autenticazione (Google Authenticator, Authy, 1Password…).</li>
            <li>Scansiona il QR qui sotto (oppure inserisci il codice manuale).</li>
            <li>Inserisci il codice a 6 cifre generato per confermare.</li>
          </ol>

          {qrDataUrl && (
            <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- inline data URI QR */}
              <img src={qrDataUrl} alt="QR per l'autenticazione a due fattori" className="rounded-lg ring-1 ring-brown-900/10" />
              <div>
                <p className={labelCls}>Codice manuale</p>
                <code className="text-sm break-all text-brown-950">{user?.totpSecret}</code>
              </div>
            </div>
          )}

          <ActionForm action={confirmTotp} className="mt-6 flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls} htmlFor="code">Codice di verifica</label>
              <input id="code" name="code" inputMode="numeric" placeholder="123456" required className={`${inputCls} w-40`} />
            </div>
            <PendingButton>Attiva 2FA</PendingButton>
          </ActionForm>
        </Panel>
      )}
    </div>
  );
}
