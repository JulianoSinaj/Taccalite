"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  AccountForm,
  AccountPanel,
  AccountSubmit,
  accountInputCls,
  accountLabelCls,
} from "./AccountForm";
import type { ActionState } from "@/lib/admin/action-state";
import {
  updateOwnProfile,
  changeOwnPassword,
  signOutOtherDevices,
  resendOwnVerification,
  setMarketingConsent,
  startOwnTotpEnrolment,
  confirmOwnTotp,
  regenerateOwnRecoveryCodes,
  disableOwnTotp,
  saveOwnAddress,
  deleteOwnAddress,
  makeOwnAddressDefault,
  requestOwnErasure,
} from "@/lib/account/actions";

export type SettingsProps = {
  profile: { name: string; email: string | null; phone: string | null; username: string };
  emailVerified: boolean;
  marketingConsent: boolean;
  twoFactor: { enabled: boolean; qrDataUrl: string; secret: string | null; remaining: number; issued: number };
  sessions: { isCurrent: boolean; device: string; ip: string | null; lastSeenAt: Date | null; createdAt: Date | null }[];
  addresses: {
    id: string;
    label: string;
    name: string;
    phone: string | null;
    street: string;
    city: string;
    postcode: string;
    province: string;
    isDefault: boolean;
  }[];
};

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/**
 * Recovery codes are returned in the action result and stored only as hashes, so
 * this is the one and only render in which they can be shown.
 */
function CodeList({ state }: { state: ActionState }) {
  const codes = Array.isArray(state.data) ? (state.data as string[]) : null;
  return (
    <div className="mt-4 border border-gold-dark/40 bg-gold/10 p-4">
      <p className="flex items-start gap-2 text-sm font-semibold text-brown-950">
        <Check className="mt-0.5 size-4 shrink-0 text-gold-deep" />
        {state.message}
      </p>
      {codes && (
        <>
          <ul className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-sm text-brown-950 sm:grid-cols-3">
            {codes.map((c) => (
              <li key={c} className="border border-rule bg-paper px-2 py-1.5 text-center">
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-brown-700">
            Salvali ora: sono conservati solo cifrati e non potremo mostrarteli di nuovo.
          </p>
        </>
      )}
    </div>
  );
}

export default function AccountSettings(props: SettingsProps) {
  const { profile, emailVerified, marketingConsent, twoFactor, sessions, addresses } = props;
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);

  const otherSessions = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="space-y-6">
      {/* Unverified is the state in which recovery quietly does not work and past
          orders stay unclaimed, so it leads rather than hiding in a corner. */}
      {profile.email && !emailVerified && (
        <AccountForm action={resendOwnVerification}>
          <div className="border border-danger/30 bg-danger-soft px-5 py-4">
            <p className="flex items-start gap-2 font-semibold text-danger-soft-fg">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              Conferma il tuo indirizzo email
            </p>
            <p className="mt-1.5 text-sm text-danger-soft-fg/90">
              Finché <strong>{profile.email}</strong> non è confermato non possiamo reimpostare la
              tua password né collegarti gli ordini fatti prima di registrarti.
            </p>
            <div className="mt-3">
              <AccountSubmit tone="quiet">Inviami di nuovo il link</AccountSubmit>
            </div>
          </div>
        </AccountForm>
      )}

      <AccountPanel title="I tuoi dati" description="Nome, email e telefono del tuo account.">
        <AccountForm action={updateOwnProfile} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={accountLabelCls} htmlFor="set-name">
              Nome e cognome
            </label>
            <input
              id="set-name"
              name="name"
              required
              defaultValue={profile.name}
              className={accountInputCls}
            />
          </div>
          <div>
            <label className={accountLabelCls} htmlFor="set-email">
              Email
            </label>
            <input
              id="set-email"
              name="email"
              type="email"
              required
              defaultValue={profile.email ?? ""}
              className={accountInputCls}
            />
            <p className="mt-1.5 text-xs text-taupe">
              Cambiandola ti scriviamo al nuovo indirizzo: diventa effettiva solo dopo la conferma.
            </p>
          </div>
          <div>
            <label className={accountLabelCls} htmlFor="set-phone">
              Telefono
            </label>
            <input
              id="set-phone"
              name="phone"
              type="tel"
              defaultValue={profile.phone ?? ""}
              className={accountInputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <AccountSubmit>Salva</AccountSubmit>
          </div>
        </AccountForm>
      </AccountPanel>

      <AccountPanel
        title="Password"
        description="Per cambiarla ci serve quella attuale. Gli altri dispositivi verranno disconnessi."
      >
        <AccountForm action={changeOwnPassword} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={accountLabelCls} htmlFor="set-current">
              Password attuale
            </label>
            <input
              id="set-current"
              name="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              className={accountInputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={accountLabelCls} htmlFor="set-newpass">
              Nuova password
            </label>
            <input
              id="set-newpass"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Almeno 8 caratteri"
              className={accountInputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <AccountSubmit>Cambia password</AccountSubmit>
          </div>
        </AccountForm>
      </AccountPanel>

      <AccountPanel
        title="Verifica in due passaggi"
        description="Un codice dal telefono oltre alla password. Consigliata se usi lo stesso indirizzo altrove."
      >
        {twoFactor.enabled ? (
          <div className="space-y-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-ok">
              <ShieldCheck className="size-4" /> Attiva su questo account.
            </p>
            <div className="border-t border-rule pt-5">
              <p className="text-sm text-brown-700">
                Codici di recupero: <strong>{twoFactor.remaining}</strong> di {twoFactor.issued}{" "}
                ancora validi.
              </p>
              {twoFactor.remaining === 0 && (
                <p className="mt-2 border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-soft-fg">
                  Nessun codice valido: se perdi il telefono non potresti più entrare. Generane
                  subito.
                </p>
              )}
              <AccountForm
                action={regenerateOwnRecoveryCodes}
                className="mt-3"
                onSuccess={(state) => <CodeList state={state} />}
              >
                <AccountSubmit
                  tone="quiet"
                  confirm={twoFactor.issued > 0 ? "I codici attuali smetteranno di funzionare." : undefined}
                >
                  {twoFactor.issued > 0 ? "Rigenera i codici" : "Genera i codici"}
                </AccountSubmit>
              </AccountForm>
            </div>
            <div className="border-t border-rule pt-5">
              <AccountForm action={disableOwnTotp}>
                <AccountSubmit tone="danger" confirm="Disattivare la verifica in due passaggi?">
                  Disattiva
                </AccountSubmit>
              </AccountForm>
            </div>
          </div>
        ) : twoFactor.secret ? (
          <div className="space-y-5">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              {twoFactor.qrDataUrl && (
                <Image
                  src={twoFactor.qrDataUrl}
                  alt="QR per l'autenticazione a due fattori"
                  width={200}
                  height={200}
                  unoptimized
                  className="border border-rule"
                />
              )}
              <div>
                <p className={accountLabelCls}>Codice manuale</p>
                <code className="text-sm break-all text-brown-950">{twoFactor.secret}</code>
              </div>
            </div>
            <AccountForm action={confirmOwnTotp} onSuccess={(state) => <CodeList state={state} />}>
              <label className={accountLabelCls} htmlFor="totp-code">
                Codice a 6 cifre
              </label>
              <input
                id="totp-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                className={`${accountInputCls} max-w-40`}
              />
              <div className="mt-4">
                <AccountSubmit tone="gold">Attiva</AccountSubmit>
              </div>
            </AccountForm>
          </div>
        ) : (
          <AccountForm action={startOwnTotpEnrolment}>
            <p className="mb-4 text-sm text-brown-700">
              Ti mostreremo un QR da scansionare con Google Authenticator, Authy, 1Password o simili.
            </p>
            <AccountSubmit>Attiva la verifica in due passaggi</AccountSubmit>
          </AccountForm>
        )}
      </AccountPanel>

      <AccountPanel
        title="Dispositivi collegati"
        description="Se non riconosci un accesso, disconnetti tutto e cambia la password."
      >
        <ul className="divide-y divide-rule border-y border-rule">
          {sessions.map((s, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <span className="text-sm text-brown-950">
                {s.device}
                {s.isCurrent && (
                  <span className="ml-2 rounded-full bg-brown-950 px-2 py-0.5 text-[0.625rem] font-bold tracking-wider text-cream uppercase">
                    Questo dispositivo
                  </span>
                )}
              </span>
              <span className="text-xs text-taupe">
                Ultimo accesso {fmt(s.lastSeenAt)}
                {s.ip ? ` · ${s.ip}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <AccountForm action={signOutOtherDevices} className="mt-5">
          <AccountSubmit tone="quiet">
            {otherSessions > 0
              ? `Disconnetti gli altri ${otherSessions} dispositivi`
              : "Disconnetti gli altri dispositivi"}
          </AccountSubmit>
        </AccountForm>
      </AccountPanel>

      <AccountPanel
        title="Indirizzi"
        description="Salvali una volta e li ritrovi già compilati alla cassa."
      >
        {addresses.length > 0 && (
          <ul className="mb-5 space-y-3">
            {addresses.map((a) => (
              <li key={a.id} className="border border-rule bg-paper-warm/40 p-4">
                {editingAddress === a.id ? (
                  <AddressFields
                    address={a}
                    onCancel={() => setEditingAddress(null)}
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-sm text-brown-800">
                      <p className="font-semibold text-brown-950">
                        {a.label || a.name || "Indirizzo"}
                        {a.isDefault && (
                          <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-[0.625rem] font-bold tracking-wider text-on-gold uppercase">
                            Predefinito
                          </span>
                        )}
                      </p>
                      <p className="mt-1">
                        {a.street}, {a.postcode} {a.city} {a.province}
                      </p>
                      {a.phone && <p className="text-taupe">{a.phone}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingAddress(a.id)}
                        className="text-sm text-taupe underline hover:text-brown-950"
                      >
                        Modifica
                      </button>
                      {!a.isDefault && (
                        <AccountForm action={makeOwnAddressDefault}>
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            type="submit"
                            className="text-sm text-taupe underline hover:text-brown-950"
                          >
                            Rendi predefinito
                          </button>
                        </AccountForm>
                      )}
                      <AccountForm action={deleteOwnAddress}>
                        <input type="hidden" name="id" value={a.id} />
                        <AccountSubmit tone="danger" confirm="Eliminare questo indirizzo?">
                          Elimina
                        </AccountSubmit>
                      </AccountForm>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {addingAddress ? (
          <div className="border border-rule bg-paper-warm/40 p-4">
            <AddressFields onCancel={() => setAddingAddress(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingAddress(true)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-rule-strong px-6 py-2.5 text-xs font-bold tracking-widest text-brown-800 uppercase transition-colors hover:bg-paper-warm"
          >
            Aggiungi un indirizzo
          </button>
        )}
      </AccountPanel>

      <AccountPanel title="Comunicazioni" description="Novità, degustazioni e la porchetta del sabato.">
        <AccountForm action={setMarketingConsent}>
          <label className="flex items-start gap-3 text-sm text-brown-800">
            <input
              type="checkbox"
              name="consent"
              defaultChecked={marketingConsent}
              className="mt-0.5 size-5 shrink-0 rounded accent-brown-950"
            />
            Desidero ricevere novità e inviti via email.
          </label>
          <div className="mt-4">
            <AccountSubmit tone="quiet">Salva preferenza</AccountSubmit>
          </div>
        </AccountForm>
      </AccountPanel>

      <AccountPanel
        title="I tuoi dati personali"
        description="Puoi scaricare tutto quello che conserviamo, o chiederne la cancellazione."
      >
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/account/export"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-rule-strong px-6 py-2.5 text-xs font-bold tracking-widest text-brown-800 uppercase transition-colors hover:bg-paper-warm"
          >
            Scarica i miei dati
          </a>
        </div>
        <div className="mt-5 border-t border-rule pt-5">
          <AccountForm action={requestOwnErasure}>
            <label className={accountLabelCls} htmlFor="erase-reason">
              Motivo (facoltativo)
            </label>
            <input id="erase-reason" name="reason" maxLength={500} className={accountInputCls} />
            <p className="mt-2 mb-4 text-xs text-taupe">
              Gli ordini già emessi restano conservati per obblighi fiscali, come previsto dalla
              legge. Tutto il resto viene anonimizzato.
            </p>
            <AccountSubmit
              tone="danger"
              confirm="Inviare la richiesta di cancellazione dei tuoi dati?"
            >
              Richiedi la cancellazione
            </AccountSubmit>
          </AccountForm>
        </div>
      </AccountPanel>
    </div>
  );
}

/** Shared create/edit address fields. */
function AddressFields({
  address,
  onCancel,
}: {
  address?: SettingsProps["addresses"][number];
  onCancel: () => void;
}) {
  return (
    <AccountForm action={saveOwnAddress} className="grid gap-4 sm:grid-cols-2">
      {address && <input type="hidden" name="id" value={address.id} />}
      <div>
        <label className={accountLabelCls}>Etichetta</label>
        <input name="label" defaultValue={address?.label ?? ""} placeholder="Casa" className={accountInputCls} />
      </div>
      <div>
        <label className={accountLabelCls}>Destinatario</label>
        <input name="name" defaultValue={address?.name ?? ""} className={accountInputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={accountLabelCls}>Via e numero</label>
        <input name="street" required defaultValue={address?.street ?? ""} className={accountInputCls} />
      </div>
      <div>
        <label className={accountLabelCls}>CAP</label>
        <input
          name="postcode"
          required
          inputMode="numeric"
          maxLength={5}
          defaultValue={address?.postcode ?? ""}
          className={accountInputCls}
        />
      </div>
      <div>
        <label className={accountLabelCls}>Comune</label>
        <input name="city" required defaultValue={address?.city ?? ""} className={accountInputCls} />
      </div>
      <div>
        <label className={accountLabelCls}>Provincia</label>
        <input name="province" maxLength={4} defaultValue={address?.province ?? ""} className={accountInputCls} />
      </div>
      <div>
        <label className={accountLabelCls}>Telefono</label>
        <input name="phone" type="tel" defaultValue={address?.phone ?? ""} className={accountInputCls} />
      </div>
      <label className="flex items-start gap-3 text-sm text-brown-800 sm:col-span-2">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.isDefault ?? false}
          className="mt-0.5 size-5 shrink-0 rounded accent-brown-950"
        />
        Usa come indirizzo predefinito.
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <AccountSubmit>Salva indirizzo</AccountSubmit>
        <button type="button" onClick={onCancel} className="text-sm text-taupe underline hover:text-brown-950">
          Annulla
        </button>
      </div>
    </AccountForm>
  );
}
