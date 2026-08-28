import Link from "next/link";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { Panel, fmtDateTime } from "@/components/admin/ui";
import { ClosureForm } from "@/components/admin/ClosureForm";
import { copyClosureToNextYear, deleteClosure, notifyClosureBookings } from "@/lib/admin/fulfilment-actions";
import { closureStatus, closureTimeLabel, dayCount, fmtDay, isWholeDay } from "@/lib/closures";
import type { ClosureWithBookings } from "@/lib/admin/queries";
import type { ShopClosureRow, ShopRow } from "@/lib/db/schema";

const pill = "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase";

/** "In corso" / "Domani" / "Tra 5 giorni" — the one thing a glance needs. */
function StatusPill({ closure, today }: { closure: ShopClosureRow; today: string }) {
  const status = closureStatus(closure, today);
  if (status === "past") return <span className={`${pill} bg-brown-900/10 text-brown-800/70`}>Passata</span>;
  if (status === "ongoing") return <span className={`${pill} bg-warn-soft text-warn-soft-fg`}>In corso</span>;
  const inDays = dayCount(today, closure.fromDate) - 1;
  if (inDays > 14) return null;
  return (
    <span className={`${pill} bg-gold/15 text-gold-deep`}>
      {inDays === 1 ? "Domani" : `Tra ${inDays} giorni`}
    </span>
  );
}

function Title({ closure }: { closure: ShopClosureRow }) {
  const days = dayCount(closure.fromDate, closure.toDate);
  return (
    <p className="font-display text-lg text-brown-950">
      {closure.fromDate === closure.toDate
        ? fmtDay(closure.fromDate, { weekday: true })
        : `${fmtDay(closure.fromDate, { weekday: true })} — ${fmtDay(closure.toDate, { weekday: true })}`}
      {days > 1 && <span className="ml-2 text-xs font-normal text-brown-800/70">{days} giorni</span>}
    </p>
  );
}

function Flags({ closure }: { closure: ShopClosureRow }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {!isWholeDay(closure) && (
        <span className={`${pill} bg-brown-950 text-cream`}>{closureTimeLabel(closure)}</span>
      )}
      {closure.blocksReservations && (
        <span className={`${pill} bg-brown-900/10 text-brown-800`}>Prenotazioni sospese</span>
      )}
      {closure.blocksPickup && <span className={`${pill} bg-brown-900/10 text-brown-800`}>Ritiri sospesi</span>}
    </div>
  );
}

/**
 * The whole reason this page counts anything. A closure added after bookings
 * were taken is the normal case, and the shop has to know who to call — and,
 * since the notice went in, who has already been told.
 */
function Bookings({ closure }: { closure: ClosureWithBookings }) {
  const booked = closure.reservationCount + closure.pickupCount;
  if (booked === 0) return null;
  // The counts are scoped to the closure's shop, so the lists they open must
  // be too — otherwise "3 prenotazioni" opened a page of 9.
  const scope = closure.shopSlug ? `&negozio=${encodeURIComponent(closure.shopSlug)}` : "";
  const range = `da=${closure.fromDate}&a=${closure.toDate}`;
  // The day sheet is the better page for one day (times, phones, print); it
  // shows a single day, so a range goes to the orders list filtered on the
  // appointment instead.
  const pickupsHref =
    closure.fromDate === closure.toDate
      ? `/admin/fulfilment/oggi?giorno=${closure.fromDate}${scope}`
      : `/admin/orders?tipo=pickup&data=ritiro&${range}${scope}`;
  const rangeLabel =
    closure.fromDate === closure.toDate ? `il ${closure.fromDate}` : `dal ${closure.fromDate} al ${closure.toDate}`;

  return (
    <div className="mt-3 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-warn-soft-fg">
      <p>
        In queste date risultano già{" "}
        {closure.reservationCount > 0 && (
          <Link href={`/admin/reservations?${range}${scope}`} className="font-bold underline">
            {closure.reservationCount === 1 ? "1 prenotazione" : `${closure.reservationCount} prenotazioni`}
          </Link>
        )}
        {closure.reservationCount > 0 && closure.pickupCount > 0 ? " e " : ""}
        {closure.pickupCount > 0 && (
          <Link href={pickupsHref} className="font-bold underline">
            {closure.pickupCount === 1 ? "1 ritiro" : `${closure.pickupCount} ritiri`}
          </Link>
        )}
        . Non sono state annullate.
      </p>
      {closure.notifiedAt && (
        <p className="mt-1">
          Avviso inviato {fmtDateTime(closure.notifiedAt)} a {closure.notifiedCount}{" "}
          {closure.notifiedCount === 1 ? "cliente" : "clienti"}.
        </p>
      )}
      {closure.toNotify > 0 ? (
        <ActionForm action={notifyClosureBookings} className="mt-2 block">
          <input type="hidden" name="id" value={closure.id} />
          <PendingButton
            tone="dark"
            confirm={`Avvisare via email ${closure.toNotify} ${closure.toNotify === 1 ? "cliente" : "clienti"} ${
              closure.notifiedAt ? "non ancora avvisati" : "prenotati"
            } ${rangeLabel}? Niente viene annullato: l'email dice che siamo chiusi e invita a risentirci.`}
          >
            {closure.notifiedAt
              ? `Avvisa i ${closure.toNotify} nuovi`
              : `Avvisa ${closure.toNotify === 1 ? "il cliente" : `i ${closure.toNotify} clienti`} via email`}
          </PendingButton>
        </ActionForm>
      ) : (
        <p className="mt-1 italic">
          {closure.notifiedAt
            ? "Tutti i clienti con email sono stati avvisati."
            : "Nessuno ha lasciato un'email: da avvisare per telefono."}
        </p>
      )}
    </div>
  );
}

/**
 * One closure in the list. Upcoming ones carry their bookings and an inline
 * edit form; past ones are read-only history, kept so a year can be repeated.
 */
export function ClosureCard({
  closure,
  shops,
  shopName,
  today,
}: {
  closure: ClosureWithBookings | ShopClosureRow;
  shops: ShopRow[];
  shopName: Map<string, string>;
  today: string;
}) {
  const past = closureStatus(closure, today) === "past";
  const when = closure.fromDate === closure.toDate ? `del ${closure.fromDate}` : `dal ${closure.fromDate} al ${closure.toDate}`;
  const nextYear = Number(closure.fromDate.slice(0, 4)) + 1;

  return (
    <Panel className={past ? "opacity-80" : ""}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Title closure={closure} />
            <StatusPill closure={closure} today={today} />
          </div>
          <p className="mt-0.5 text-xs text-brown-800/70">
            {closure.shopSlug ? (shopName.get(closure.shopSlug) ?? closure.shopSlug) : "Tutte le sedi"}
            {closure.reason ? ` · ${closure.reason}` : ""}
          </p>
          <Flags closure={closure} />
          {!past && "toNotify" in closure && <Bookings closure={closure} />}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <ActionForm action={copyClosureToNextYear} className="inline-flex">
            <input type="hidden" name="id" value={closure.id} />
            <PendingButton
              tone="dark"
              confirm={`Aggiungere la stessa chiusura per il ${nextYear}, con le stesse date, sede e motivo?`}
            >
              Ripeti nel {nextYear}
            </PendingButton>
          </ActionForm>
          <DeleteForm
            action={deleteClosure}
            id={closure.id}
            confirm={
              past
                ? `Rimuovere dallo storico la chiusura ${when}?`
                : `Rimuovere la chiusura ${when}? Le date tornano prenotabili.`
            }
          >
            Rimuovi
          </DeleteForm>
        </div>
      </div>

      {!past && (
        <details className="mt-4 border-t border-brown-900/10 pt-3">
          <summary className="w-fit cursor-pointer text-[11px] font-bold tracking-widest text-brown-800/70 uppercase hover:text-brown-950">
            Modifica
          </summary>
          <div className="mt-4">
            <ClosureForm closure={closure} shops={shops} today={today} />
          </div>
        </details>
      )}
    </Panel>
  );
}
