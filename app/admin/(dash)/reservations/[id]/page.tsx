import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AdminHeader,
  Panel,
  StatusBadge,
  BackLink,
  euro,
  fmtDate,
  fmtDateTime,
  inputCls,
  labelCls,
  reservationTypeLabel,
} from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { ReservationForm } from "@/components/admin/ReservationForm";
import {
  adminGetReservation,
  adminGetShops,
  getReservationsSameDay,
  getOrderForReservation,
} from "@/lib/admin/queries";
import { porchettaCapacityFor, seatsBookedInSlot } from "@/lib/reservations";
import {
  updateReservationStatus,
  setReservationDeposit,
  promoteFromWaitlist,
  markPorchettaReady,
  setReservationTable,
  resendReservationEmail,
} from "@/lib/admin/reservation-actions";
import { assertShopScope } from "@/lib/admin/scope";

export const dynamic = "force-dynamic";

/**
 * One booking, in full.
 *
 * The reservations surface was list-only: the dashboard, the calendar and a
 * customer's page all had bookings they could not link to, and every action had
 * to happen inside a list row. This is the thing they link to — and the only
 * place that shows a booking in the context of its day.
 */
export default async function ReservationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await adminGetReservation(id);
  if (!row) notFound();
  // A filtered list is not access control: without this, another location
  // 's record is one typed URL away. `notFound` rather than a message —
  // "it exists but is not yours" is itself information.
  await assertShopScope(row.reservation.shopSlug);

  const r = row.reservation;
  const [shops, sameDay, convertedOrder] = await Promise.all([
    adminGetShops(),
    getReservationsSameDay(r.shopSlug, r.date, r.id),
    getOrderForReservation(r.id),
  ]);
  const shop = shops.find((s) => s.slug === r.shopSlug);

  // What else the day is already carrying, for the two capacities the shop has.
  const capacity = await porchettaCapacityFor(r.shopSlug);
  const kgBooked = sameDay
    .filter((x) => x.type === "porchetta")
    .reduce((s, x) => s + (x.quantityKg ?? 0), 0);
  const seatsBooked = r.time ? seatsBookedInSlot(sameDay, r.time) : 0;
  const seatsCap = shop?.seatsCapacity ?? null;

  return (
    <div>
      <BackLink href="/admin/reservations">Prenotazioni</BackLink>
      <AdminHeader
        title={`Prenotazione ${r.reference}`}
        subtitle={`${reservationTypeLabel(r.type)} · ${fmtDate(r.date)}${r.time ? ` · ${r.time}` : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            {/* An "ordine speciale" is the one booking type that represents a
                sale: a name, a phone, a date and notes, with no line items, no
                price, no VAT, no stock movement and no loyalty. This is the only
                path from one to the other. */}
            {r.type === "order" &&
              (convertedOrder ? (
                <Link
                  href={`/admin/orders/${convertedOrder.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                >
                  Ordine {convertedOrder.orderNumber} →
                </Link>
              ) : (
                r.status !== "cancelled" && (
                  <Link
                    href={`/admin/orders/new?prenotazione=${r.id}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold px-4 py-2 text-xs font-bold tracking-widest text-on-gold uppercase hover:bg-gold-dark"
                  >
                    Converti in ordine
                  </Link>
                )
              ))}
            {r.type === "porchetta" && r.email && (
              <ActionForm action={markPorchettaReady} className="inline-flex">
                <input type="hidden" name="id" value={r.id} />
                {/* Marking it ready was one-shot: once sent, a customer who
                    lost the email could not be told again. The repeat is a
                    separate, explicit click, so double-tapping the first one
                    still can't send twice. */}
                {r.readyAt && <input type="hidden" name="ripeti" value="true" />}
                <PendingButton tone="gold">
                  {r.readyAt ? "Reinvia avviso di ritiro" : "Segna pronta"}
                </PendingButton>
              </ActionForm>
            )}
            <Link
              href={`/admin/reservations/agenda?giorno=${r.date}`}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Agenda del giorno
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <StatusBadge status={r.status} />
              {r.waitlisted && (
                <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-bold tracking-widest text-warn uppercase">
                  Lista d&apos;attesa
                </span>
              )}
              {r.readyAt && (
                <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-bold tracking-widest text-ok uppercase">
                  Pronta ✓
                </span>
              )}
              {r.remindedAt && (
                <span className="rounded-full bg-info-soft px-2.5 py-1 text-[11px] font-bold tracking-widest text-info-soft-fg uppercase">
                  Promemoria inviato
                </span>
              )}
            </div>

            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-brown-800/60">Cliente</dt>
                <dd className="text-brown-950">
                  {r.name}
                  {r.userId && (
                    <>
                      {" · "}
                      <Link
                        href={`/admin/loyalty/${r.userId}`}
                        className="font-semibold text-brown-800 underline decoration-gold-dark/60 underline-offset-2 hover:text-brown-950"
                      >
                        scheda cliente →
                      </Link>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-brown-800/60">Telefono</dt>
                <dd className="text-brown-950">{r.phone}</dd>
              </div>
              <div>
                <dt className="text-brown-800/60">Email</dt>
                <dd className="text-brown-950">{r.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-brown-800/60">Sede</dt>
                <dd className="text-brown-950">{shop?.name ?? r.shopSlug}</dd>
              </div>
              {r.guests != null && (
                <div>
                  <dt className="text-brown-800/60">Ospiti</dt>
                  <dd className="text-brown-950">{r.guests}</dd>
                </div>
              )}
              {r.quantityKg != null && (
                <div>
                  <dt className="text-brown-800/60">Quantità</dt>
                  <dd className="text-brown-950">{r.quantityKg} kg</dd>
                </div>
              )}
              <div>
                <dt className="text-brown-800/60">Ricevuta il</dt>
                <dd className="text-brown-950">{fmtDateTime(r.createdAt)}</dd>
              </div>
              {r.tableNumber && (
                <div>
                  <dt className="text-brown-800/60">Tavolo</dt>
                  <dd className="text-brown-950">{r.tableNumber}</dd>
                </div>
              )}
            </dl>

            {r.notes && (
              <p className="mt-4 border-t border-brown-900/10 pt-3 text-sm text-brown-800/80">
                <span className="text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">
                  Note del cliente
                </span>
                <br />
                {r.notes}
              </p>
            )}
            {r.adminNotes && (
              <p className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-sm text-brown-900">
                <span className="text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">
                  Nota interna
                </span>
                <br />
                {r.adminNotes}
              </p>
            )}
          </Panel>

          <Panel>
            <h3 className="font-display mb-4 text-lg text-brown-950">Modifica / sposta</h3>
            <ReservationForm shops={shops} reservation={r} />
          </Panel>

          {/* The rest of the day, so a reschedule isn't made blind. */}
          <Panel>
            <h3 className="font-display mb-1 text-lg text-brown-950">Resto della giornata</h3>
            <p className="mb-3 text-xs text-brown-800/60">
              {fmtDate(r.date)} · {shop?.name ?? r.shopSlug}
            </p>
            {sameDay.length === 0 ? (
              <p className="text-sm text-brown-800/60">Nessun&apos;altra prenotazione questo giorno.</p>
            ) : (
              <ul className="divide-y divide-brown-900/10">
                {sameDay.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/admin/reservations/${o.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-brown-900/[0.03]"
                    >
                      <span className="w-12 shrink-0 font-display font-bold text-brown-950">
                        {o.time ?? "—"}
                      </span>
                      <span className="shrink-0 text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">
                        {reservationTypeLabel(o.type)}
                      </span>
                      <span className="flex-1 truncate text-brown-950">{o.name}</span>
                      <span className="shrink-0 text-xs text-brown-800/60">
                        {o.quantityKg != null ? `${o.quantityKg} kg` : o.guests != null ? `${o.guests} p.` : ""}
                      </span>
                      <StatusBadge status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <h3 className="font-display mb-3 text-lg text-brown-950">Stato</h3>
            {r.waitlisted && r.type === "porchetta" && (
              <ActionForm action={promoteFromWaitlist} className="mb-3">
                <input type="hidden" name="id" value={r.id} />
                <PendingButton tone="gold">Conferma dalla lista d&apos;attesa</PendingButton>
              </ActionForm>
            )}
            <ActionForm action={updateReservationStatus} className="space-y-3">
              <input type="hidden" name="id" value={r.id} />
              <div>
                <label className={labelCls} htmlFor="res-status">
                  Stato
                </label>
                <select id="res-status" name="status" defaultValue={r.status} className={inputCls}>
                  <option value="pending">In attesa</option>
                  <option value="confirmed">Confermata</option>
                  <option value="completed">Completata</option>
                  <option value="cancelled">Annullata</option>
                  <option value="no_show">Non presentato</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="res-notes">
                  Note interne
                </label>
                <input
                  id="res-notes"
                  name="adminNotes"
                  defaultValue={r.adminNotes ?? ""}
                  className={inputCls}
                />
              </div>
              <PendingButton tone="dark">Aggiorna</PendingButton>
            </ActionForm>

            {/* Orders have had "reinvia email" for a while and bookings did
                not, so a lost confirmation — the one carrying the reference the
                customer reads out at the counter — could only be recovered by
                bouncing the status, which sent the wrong message. */}
            {r.email && (
              <div className="mt-4 border-t border-brown-900/10 pt-4">
                <ActionForm action={resendReservationEmail}>
                  <input type="hidden" name="id" value={r.id} />
                  <PendingButton tone="dark">Reinvia email al cliente</PendingButton>
                </ActionForm>
                <p className="mt-2 text-xs text-brown-800/60">
                  Rimanda l&apos;ultima comunicazione utile (
                  {r.readyAt ? "avviso di ritiro" : "riepilogo della prenotazione"}) a {r.email}.
                </p>
              </div>
            )}
          </Panel>

          {/* Capacity in context: what this booking uses of what the day has. */}
          <Panel>
            <h3 className="font-display mb-3 text-lg text-brown-950">Capacità del giorno</h3>
            <dl className="space-y-3 text-sm">
              {r.type === "porchetta" && (
                <div>
                  <dt className="text-brown-800/60">Porchetta</dt>
                  <dd className="font-display text-lg text-brown-950">
                    {kgBooked + (r.quantityKg ?? 0)}
                    {capacity > 0 ? ` / ${capacity}` : ""} kg
                  </dd>
                  {capacity > 0 && kgBooked + (r.quantityKg ?? 0) > capacity && (
                    <p className="text-xs font-semibold text-danger">Oltre la capacità della sede.</p>
                  )}
                </div>
              )}
              {r.time && (
                <div>
                  <dt className="text-brown-800/60">Coperti alle {r.time}</dt>
                  <dd className="font-display text-lg text-brown-950">
                    {seatsBooked + (r.guests ?? 0)}
                    {seatsCap != null ? ` / ${seatsCap}` : ""}
                  </dd>
                  {seatsCap != null && seatsBooked + (r.guests ?? 0) > seatsCap && (
                    <p className="text-xs font-semibold text-danger">
                      Oltre i coperti disponibili in questa fascia.
                    </p>
                  )}
                </div>
              )}
            </dl>

            <ActionForm action={setReservationTable} className="mt-4 flex items-end gap-2 border-t border-brown-900/10 pt-4">
              <input type="hidden" name="id" value={r.id} />
              <div className="flex-1">
                <label className={labelCls} htmlFor="res-table">
                  Tavolo
                </label>
                <input
                  id="res-table"
                  name="tableNumber"
                  defaultValue={r.tableNumber ?? ""}
                  placeholder="es. 4, vetrina"
                  className={inputCls}
                />
              </div>
              <PendingButton tone="dark">Salva</PendingButton>
            </ActionForm>
          </Panel>

          <Panel>
            <h3 className="font-display mb-3 text-lg text-brown-950">Acconto</h3>
            <ActionForm action={setReservationDeposit} className="space-y-2">
              <input type="hidden" name="id" value={r.id} />
              <div className="flex items-center gap-2">
                <input
                  name="depositEuros"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={r.depositCents ? (r.depositCents / 100).toFixed(2) : ""}
                  placeholder="€"
                  aria-label="Importo dell'acconto in euro"
                  className={`${inputCls} w-28`}
                />
                <label className="flex items-center gap-1.5 text-xs font-medium text-brown-900">
                  <input
                    type="checkbox"
                    name="paid"
                    defaultChecked={!!r.depositPaidAt}
                    className="h-4 w-4 rounded accent-brown-950"
                  />
                  Incassato
                </label>
                <PendingButton tone="dark">Salva</PendingButton>
              </div>
            </ActionForm>
            {r.depositCents > 0 && (
              <p
                className={`mt-2 text-xs ${
                  r.depositForfeitedAt ? "font-medium text-warn" : "text-brown-800/60"
                }`}
              >
                {r.depositForfeitedAt
                  ? `⚠ Acconto di ${euro(r.depositCents)} trattenuto (non presentato)`
                  : r.depositPaidAt
                    ? `✓ ${euro(r.depositCents)} incassati il ${fmtDate(r.depositPaidAt)}`
                    : `${euro(r.depositCents)} da incassare`}
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
