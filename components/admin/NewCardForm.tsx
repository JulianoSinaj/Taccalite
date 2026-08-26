"use client";

import { useState } from "react";
import Link from "next/link";
import { inputCls, labelCls, Panel } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { createCustomerAccount } from "@/lib/admin/user-actions";
import type { ActionState } from "@/lib/admin/action-state";

type Created = { cardNumber: string; name: string; userId: string; email: string | null };

const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15";

/**
 * The other half of the counter workflow: crediting points needs a card, and
 * `createCustomerAccount` is the narrow, staff-safe way to make one — it can
 * only ever produce a customer.
 *
 * The new number used to live in a four-second toast and nowhere else; a
 * customer without an email never saw it again. It now stays on screen until
 * the next card, and one tap carries it into the accrual form.
 */
export function NewCardForm({ onUseCard }: { onUseCard: (card: string) => void }) {
  const [created, setCreated] = useState<Created | null>(null);
  // Remounting the (uncontrolled) form is how it clears after a success.
  const [formKey, setFormKey] = useState(0);

  function handleCreated(state: ActionState) {
    const data = state.data as Created | undefined;
    if (!data?.cardNumber) return;
    setCreated(data);
    setFormKey((k) => k + 1);
  }

  return (
    <Panel>
      <h2 className="font-display text-lg text-brown-950">Nuova tessera</h2>
      <p className="mt-1 mb-4 text-sm text-brown-800/70">
        Il cliente non ha ancora la tessera? Creala qui: bastano il nome e un recapito. Con
        l&apos;email gli arriva un link per attivare l&apos;area personale da solo.
      </p>

      {created && (
        <div role="status" className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok-soft-fg">
          <p>
            Tessera <strong className="font-mono">{created.cardNumber}</strong> creata per{" "}
            <strong>{created.name}</strong>.
          </p>
          <p className="mt-1 text-xs opacity-80">
            {created.email
              ? "Il link per attivare l'area personale è stato inviato via email."
              : "Senza email il cliente non vede la tessera online: annota il numero sulla tessera fisica."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onUseCard(created.cardNumber)}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase transition-colors hover:bg-brown-900"
            >
              Accredita il primo acquisto
            </button>
            <Link href={`/admin/loyalty/${created.userId}`} className={secondaryBtn}>
              Scheda cliente
            </Link>
          </div>
        </div>
      )}

      <ActionForm
        key={formKey}
        action={createCustomerAccount}
        onSuccess={handleCreated}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="cust-name">
            Nome e cognome
          </label>
          <input id="cust-name" name="name" required maxLength={200} autoComplete="off" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="cust-email">
            Email
          </label>
          <input id="cust-email" name="email" type="email" maxLength={200} autoComplete="off" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="cust-phone">
            Telefono
          </label>
          <input id="cust-phone" name="phone" type="tel" maxLength={40} autoComplete="off" className={inputCls} />
        </div>
        <p className="-mt-2 text-xs text-brown-800/60 sm:col-span-2">Serve almeno uno dei due recapiti.</p>
        <label className="flex items-start gap-3 text-sm text-brown-800 sm:col-span-2">
          <input
            type="checkbox"
            name="marketingConsent"
            className="mt-0.5 size-5 shrink-0 rounded accent-brown-950"
          />
          Acconsente a ricevere novità e inviti via email.
        </label>
        <div className="sm:col-span-2">
          <PendingButton tone="dark">Crea la tessera</PendingButton>
        </div>
      </ActionForm>
    </Panel>
  );
}
