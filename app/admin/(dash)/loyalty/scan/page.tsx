import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { ScanForm } from "@/components/admin/ScanForm";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { createCustomerAccount } from "@/lib/admin/user-actions";
import { getSetting } from "@/lib/db/queries";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLoyaltyScan() {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin/login");
  }

  // Passed in so the form can preview the points before anything is credited.
  const pointsPerEuro = await getSetting<number>("loyalty.pointsPerEuro", 1);

  return (
    <div>
      <AdminHeader
        title="Punti in negozio"
        subtitle="Accredita i punti fedeltà per un acquisto al banco"
      />
      <ScanForm pointsPerEuro={pointsPerEuro || 1} />

      {/* This screen takes an amount in euros and credits points — and creates
          no order, no stock movement, no VAT and no revenue. That is a
          legitimate shortcut for a sale already rung into the till, but nothing
          said so, and a €45 typed here was invisible to every report in the
          system. Two counter workflows exist; this says which one this is. */}
      <p className="mt-4 max-w-2xl text-sm text-brown-800/70">
        Questa schermata accredita <strong className="font-semibold">solo i punti</strong>: la
        vendita non entra negli incassi, nel magazzino né nel riepilogo IVA. Usala quando lo
        scontrino è già stato battuto alla cassa. Se invece la vendita va registrata qui, apri{" "}
        <Link href="/admin/orders/new" className="font-semibold text-gold-deep underline">
          Nuovo ordine
        </Link>{" "}
        — accredita gli stessi punti e mette in conto anche merce e incasso.
      </p>

      {/* The other half of the counter workflow. Crediting points needs a card,
          and until now nobody at the till could make one — account creation was
          admin-only, so the answer to "posso avere la tessera?" was "torni
          quando c'è il titolare". `createCustomerAccount` is the narrow,
          staff-safe version: it can only ever produce a customer. */}
      <Panel className="mt-8 max-w-2xl">
        <h2 className="font-display text-lg text-brown-950">Nuova tessera</h2>
        <p className="mt-1 mb-4 text-sm text-brown-800/70">
          Il cliente non ha ancora la tessera? Creala qui: bastano il nome e un recapito.
          Con l&apos;email gli arriva un link per attivare l&apos;area personale da solo.
        </p>
        <ActionForm action={createCustomerAccount} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="cust-name">
              Nome e cognome
            </label>
            <input id="cust-name" name="name" required maxLength={200} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="cust-email">
              Email
            </label>
            <input id="cust-email" name="email" type="email" maxLength={200} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="cust-phone">
              Telefono
            </label>
            <input id="cust-phone" name="phone" type="tel" maxLength={40} className={inputCls} />
          </div>
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
    </div>
  );
}
