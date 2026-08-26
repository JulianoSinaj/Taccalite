import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/ui";
import { InStoreLoyalty } from "@/components/admin/InStoreLoyalty";
import { getSetting } from "@/lib/db/queries";
import { isAdmin, requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * The counter screen: credit a purchase to a card, hand over or claim rewards,
 * and make a card for a customer who has none. It creates no order, no stock
 * movement, no VAT and no revenue — that is the job of "Nuovo ordine" — and
 * the note at the bottom says so, because a €45 typed here is invisible to
 * every report in the system.
 */
export default async function AdminLoyaltyScan() {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin/login");
  }

  const [enabled, perEuro, admin] = await Promise.all([
    getSetting<boolean>("loyalty.enabled", true),
    getSetting<number>("loyalty.pointsPerEuro", 1),
    isAdmin(),
  ]);

  return (
    <div>
      <AdminHeader
        title="Punti in negozio"
        subtitle="Accredita i punti fedeltà e consegna i premi per gli acquisti al banco"
      />

      {!enabled && (
        <p role="alert" className="mb-6 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn-soft-fg">
          <strong className="font-semibold">Programma fedeltà disattivato:</strong> l&apos;accredito dei
          punti è sospeso, la consegna dei premi resta possibile.{" "}
          {admin ? (
            <Link href="/admin/settings" className="font-semibold underline">
              Riattivalo dalle Impostazioni
            </Link>
          ) : (
            "Chiedi all'amministratore di riattivarlo dalle Impostazioni."
          )}
        </p>
      )}

      {/* The preview and the credit share `pointsForEuros`, which treats an
          unset or zero rate as 1 — passed raw so the two can never diverge. */}
      <InStoreLoyalty pointsPerEuro={perEuro} enabled={enabled} />

      <div className="mt-6 max-w-3xl space-y-2 text-sm text-brown-800/70">
        <p>
          Questa schermata accredita <strong className="font-semibold">solo i punti</strong>: la
          vendita non entra negli incassi, nel magazzino né nel riepilogo IVA. Usala quando lo
          scontrino è già stato battuto alla cassa. Se invece la vendita va registrata qui, apri{" "}
          <Link href="/admin/orders/new" className="font-semibold text-gold-deep underline">
            Nuovo ordine
          </Link>{" "}
          — accredita gli stessi punti e mette in conto anche merce e incasso.
        </p>
        <p>
          Il cliente non ha la tessera con sé?{" "}
          <Link href="/admin/loyalty" className="font-semibold text-gold-deep underline">
            Cercalo in Fedeltà
          </Link>{" "}
          per nome o telefono: il numero della tessera è nella sua scheda.
        </p>
      </div>
    </div>
  );
}
