import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { AdminHeader, Panel, inputCls, labelCls, fmtDateTime } from "@/components/admin/ui";
import { ActionForm, PendingButton, DeleteForm } from "@/components/admin/ActionForm";
import { CodeRevealForm } from "@/components/admin/RecoveryCodes";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireAdmin, listUserSessions } from "@/lib/auth/session";
import { otpauthUri } from "@/lib/auth/totp";
import { remainingRecoveryCodes } from "@/lib/auth/recovery-codes";
import {
  confirmTotp,
  disableTotp,
  regenerateRecoveryCodes,
  signOutOtherSessions,
  startTotpEnrolment,
} from "@/lib/admin/security-actions";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const actor = await requireAdmin();
  const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);

  // NB: no secret is minted here. Rendering this page used to persist one, so a
  // link prefetch mutated the user row and concurrent loads raced each other.
  // Enrolment starts from the button below (`startTotpEnrolment`).
  const enabled = !!user?.totpEnabled;
  const uri = user?.totpSecret ? otpauthUri(user.totpSecret, user.username) : "";
  const qrDataUrl = uri ? await QRCode.toDataURL(uri, { margin: 1, width: 220 }) : "";

  const storedCodes = user?.totpRecoveryCodes ?? [];
  const remaining = remainingRecoveryCodes(storedCodes);
  const sessions = await listUserSessions(actor.id);

  return (
    <div>
      <AdminHeader title="Sicurezza" subtitle="Verifica in due passaggi e sessioni attive" />

      {enabled ? (
        <Panel className="max-w-2xl">
          <p className="text-sm font-semibold text-ok">✓ La verifica in due passaggi è attiva.</p>
          <p className="mt-2 text-sm text-brown-800/70">
            Al prossimo accesso ti verrà chiesto il codice a 6 cifre dalla tua app di autenticazione.
          </p>

          <div className="mt-6 border-t border-brown-900/10 pt-5">
            <h2 className="font-display text-lg text-brown-950">Codici di recupero</h2>
            <p className="mt-1 mb-3 text-sm text-brown-800/70">
              Servono per entrare se perdi il telefono. Ogni codice vale un solo accesso.
            </p>
            {remaining === 0 && (
              <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-soft-fg">
                Non hai codici di recupero validi: senza l&apos;app di autenticazione non potresti
                più accedere. Generane subito.
              </p>
            )}
            <CodeRevealForm
              action={regenerateRecoveryCodes}
              buttonLabel={storedCodes.length > 0 ? "Rigenera codici" : "Genera codici"}
              confirm={
                storedCodes.length > 0
                  ? "Generare nuovi codici? Quelli attuali smetteranno di funzionare."
                  : undefined
              }
              meta={
                storedCodes.length > 0 ? `${remaining} di ${storedCodes.length} ancora validi` : undefined
              }
            />
          </div>

          <div className="mt-6 border-t border-brown-900/10 pt-5">
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
          <h2 className="font-display text-lg text-brown-950">Attiva la verifica in due passaggi</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-brown-800/80">
            <li>Apri un&apos;app di autenticazione (Google Authenticator, Authy, 1Password…).</li>
            <li>Scansiona il QR qui sotto (oppure inserisci il codice manuale).</li>
            <li>Inserisci il codice a 6 cifre generato per confermare.</li>
            <li>Salva i codici di recupero che ti verranno mostrati.</li>
          </ol>

          {qrDataUrl ? (
            <>
              <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- inline data URI QR */}
                <img src={qrDataUrl} alt="QR per l'autenticazione a due fattori" className="rounded-lg ring-1 ring-brown-900/10" />
                <div>
                  <p className={labelCls}>Codice manuale</p>
                  <code className="text-sm break-all text-brown-950">{user?.totpSecret}</code>
                  <div className="mt-3">
                    <ActionForm action={startTotpEnrolment}>
                      <PendingButton
                        tone="dark"
                        confirm="Generare un nuovo codice? Il QR mostrato ora smetterà di funzionare."
                      >
                        Rigenera QR
                      </PendingButton>
                    </ActionForm>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <CodeRevealForm action={confirmTotp} buttonLabel="Attiva 2FA" tone="gold">
                  <div>
                    <label className={labelCls} htmlFor="code">
                      Codice di verifica
                    </label>
                    <input
                      id="code"
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      required
                      className={`${inputCls} w-40`}
                    />
                  </div>
                </CodeRevealForm>
              </div>
            </>
          ) : (
            <div className="mt-5">
              <ActionForm action={startTotpEnrolment}>
                <PendingButton tone="gold">Genera il QR</PendingButton>
              </ActionForm>
            </div>
          )}
        </Panel>
      )}

      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Sessioni attive</h2>
      <Panel className="max-w-2xl">
        <ul className="divide-y divide-brown-900/10">
          {sessions.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
              <div>
                <p className="text-sm font-semibold text-brown-950">{s.device}</p>
                <p className="text-xs text-brown-800/70">
                  Ultimo accesso {fmtDateTime(s.lastSeenAt)}
                  {s.ip ? ` · ${s.ip}` : ""} · scade il {fmtDateTime(s.expiresAt)}
                </p>
              </div>
              {s.isCurrent && (
                <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-bold tracking-widest text-ok-soft-fg uppercase">
                  Attuale
                </span>
              )}
            </li>
          ))}
        </ul>

        {sessions.length > 1 && (
          <div className="mt-4 border-t border-brown-900/10 pt-4">
            <ActionForm action={signOutOtherSessions}>
              <PendingButton
                tone="danger"
                confirm="Chiudere tutte le altre sessioni? Gli altri dispositivi dovranno accedere di nuovo."
              >
                Chiudi le altre sessioni
              </PendingButton>
            </ActionForm>
          </div>
        )}
        <p className="mt-3 text-xs text-brown-800/70">
          Le sessioni scadono da sole dopo 30 giorni, o dopo 7 giorni di inattività.
        </p>
      </Panel>
    </div>
  );
}
