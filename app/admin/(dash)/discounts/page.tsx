import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, StatusBadge, euro, fmtDate } from "@/components/admin/ui";
import { DiscountForm } from "@/components/admin/forms";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { adminGetDiscounts } from "@/lib/admin/queries";
import { deleteDiscount, toggleDiscountActive } from "@/lib/admin/discount-actions";
import { isAdmin } from "@/lib/auth/session";
import type { DiscountCodeRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Human description of what a code takes off. */
function describe(d: DiscountCodeRow): string {
  if (d.type === "percent") return `-${d.value}%`;
  if (d.type === "fixed") return `-${euro(d.value)}`;
  return "Spedizione gratuita";
}

export default async function AdminDiscounts() {
  // Coupons move money — admin only.
  if (!(await isAdmin())) redirect("/admin");
  const codes = await adminGetDiscounts();

  return (
    <div>
      <AdminHeader title="Codici sconto" subtitle={`${codes.length} codici · percentuali, importi fissi o spedizione gratuita`} />

      <details className="mb-6">
        <summary className="w-fit cursor-pointer rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase">
          + Nuovo codice
        </summary>
        <Panel className="mt-4">
          <DiscountForm />
        </Panel>
      </details>

      {codes.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun codice sconto ancora. Creane uno qui sopra.</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {codes.map((d) => {
            const capReached = d.maxRedemptions != null && d.timesUsed >= d.maxRedemptions;
            return (
              <Panel key={d.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="font-display text-lg tracking-wide text-brown-950">{d.code}</p>
                    <p className="text-xs text-brown-800/60">
                      {describe(d)}
                      {d.minSubtotalCents > 0 ? ` · min. ${euro(d.minSubtotalCents)}` : ""}
                      {` · usato ${d.timesUsed}${d.maxRedemptions != null ? `/${d.maxRedemptions}` : ""}`}
                      {d.startsAt || d.endsAt ? ` · ${fmtDate(d.startsAt)}–${fmtDate(d.endsAt)}` : ""}
                    </p>
                  </div>
                  {!d.active && <StatusBadge status="cancelled" />}
                  {capReached && <StatusBadge status="completed" />}
                </div>
                <div className="flex items-center gap-2">
                  <ActionForm action={toggleDiscountActive} className="inline-flex">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="active" value={d.active ? "false" : "true"} />
                    <PendingButton tone="dark">{d.active ? "Disattiva" : "Attiva"}</PendingButton>
                  </ActionForm>
                  <Link
                    href={`/admin/discounts/${d.id}`}
                    className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                  >
                    Modifica
                  </Link>
                  <DeleteForm action={deleteDiscount} id={d.id} confirm={`Eliminare il codice "${d.code}"?`} />
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
