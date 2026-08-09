import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { ReservationForm } from "@/components/admin/ReservationForm";
import { adminGetShops } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

export default async function NewReservation() {
  const shops = await adminGetShops();

  return (
    <div>
      <Link
        href="/admin/reservations"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-brown-800/70 hover:text-brown-950"
      >
        <ArrowLeft className="size-4" /> Prenotazioni
      </Link>
      <AdminHeader
        title="Nuova prenotazione"
        subtitle="Registra una prenotazione presa al telefono o al banco"
      />
      <Panel>
        <ReservationForm shops={shops} />
      </Panel>
      <p className="mt-4 text-xs text-brown-800/60">
        Le prenotazioni prese qui non avvisano il titolare (sei tu a inserirle) e superano i limiti
        di capacità della porchetta: se il giorno è pieno ricevi un avviso, ma la prenotazione viene
        comunque registrata.
      </p>
    </div>
  );
}
