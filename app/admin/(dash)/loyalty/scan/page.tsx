import { redirect } from "next/navigation";
import { AdminHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { addPointsByCard } from "@/lib/admin/loyalty-actions";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLoyaltyScan() {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin/login");
  }

  return (
    <div>
      <AdminHeader
        title="Punti in negozio"
        subtitle="Accredita i punti fedeltà per un acquisto al banco"
      />

      <Panel className="max-w-xl">
        <p className="mb-6 text-sm leading-relaxed text-brown-800/70">
          Inquadra il codice QR della tessera del cliente con lo scanner (oppure digita il numero
          tessera) e inserisci l&apos;importo dell&apos;acquisto in euro. I punti vengono calcolati
          automaticamente e accreditati sulla scheda del cliente.
        </p>

        <ActionForm action={addPointsByCard} className="space-y-5">
          <div>
            <label htmlFor="card" className={labelCls}>
              Numero tessera
            </label>
            <input
              id="card"
              name="card"
              autoFocus
              autoComplete="off"
              placeholder="TAC-2026-0000"
              className={`${inputCls} font-mono`}
              required
            />
          </div>

          <div>
            <label htmlFor="euros" className={labelCls}>
              Importo acquisto (€)
            </label>
            <input
              id="euros"
              name="euros"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0,00"
              className={inputCls}
              required
            />
          </div>

          <PendingButton tone="gold">Accredita punti</PendingButton>
        </ActionForm>
      </Panel>
    </div>
  );
}
