import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { ReservationForm } from "@/components/admin/ReservationForm";
import { adminGetShops } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

type SP = { searchParams: Promise<{ data?: string }> };

/** `?data=yyyy-mm-dd` pre-fills the booking date — the calendar's empty days
 *  link here, and re-picking the day you just clicked is pure friction. */
export default async function NewReservation({ searchParams }: SP) {
  const { data } = await searchParams;
  const defaultDate = data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : undefined;
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
        <ReservationForm shops={shops} defaultDate={defaultDate} redirectTo="/admin/reservations" />
      </Panel>
      <p className="mt-4 text-xs text-brown-800/60">
        Le prenotazioni prese qui non avvisano il titolare (sei tu a inserirle) e superano i limiti
        di capacità della porchetta: se il giorno è pieno ricevi un avviso, ma la prenotazione viene
        comunque registrata.
      </p>
    </div>
  );
}
