"use client";

import { useState } from "react";
import { useFieldIds } from "@/components/admin/forms";
import { inputCls, labelCls, RESERVATION_TYPES } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { createAdminReservation, updateReservationDetails } from "@/lib/admin/reservation-actions";
import type { ReservationRow, ShopRow } from "@/lib/db/schema";

/** Today as yyyy-mm-dd, for the default booking date on a new reservation. */
function todayValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Create or reschedule a booking from the back-office.
 *
 * The `type` select drives which quantity field is relevant — guests for a
 * table, kg for porchetta — so the operator only ever sees the field that
 * applies. Both are still submitted; the server nulls the one that doesn't
 * belong to the chosen type.
 */
export function ReservationForm({
  shops,
  reservation,
  defaultDate,
  onDone,
  redirectTo,
}: {
  shops: ShopRow[];
  reservation?: ReservationRow | null;
  /** yyyy-mm-dd to open the date field on, when creating. Resolved on the server
   *  (the calendar passes the day you clicked) so the common case doesn't rely on
   *  the client's clock at all. */
  defaultDate?: string;
  /** Rendered under the buttons — e.g. a "back to list" link on the create page. */
  onDone?: React.ReactNode;
  /** Set by the dedicated create page so saving returns to the list. The copy of
   *  this form embedded in each list row leaves it unset — it is already on the
   *  list, and navigating would collapse the row the operator is working in. */
  redirectTo?: string;
}) {
  const fid = useFieldIds();
  const editing = !!reservation;
  const [type, setType] = useState<string>(reservation?.type ?? "table");

  return (
    <ActionForm
      action={editing ? updateReservationDetails : createAdminReservation}
      redirectTo={redirectTo}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {editing && <input type="hidden" name="id" value={reservation.id} />}

      <div>
        <label className={labelCls} htmlFor={fid("type")}>Tipo</label>
        <select
          id={fid("type")}
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={inputCls}
        >
          {RESERVATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor={fid("shopSlug")}>Negozio</label>
        <select id={fid("shopSlug")} name="shopSlug" defaultValue={reservation?.shopSlug ?? shops[0]?.slug} className={inputCls}>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor={fid("name")}>Nome cliente</label>
        <input id={fid("name")} name="name" required maxLength={120} defaultValue={reservation?.name} className={inputCls} />
      </div>

      <div>
        <label className={labelCls} htmlFor={fid("phone")}>Telefono</label>
        <input id={fid("phone")} name="phone" required maxLength={40} defaultValue={reservation?.phone} className={inputCls} />
      </div>

      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={fid("email")}>Email (facoltativa)</label>
        <input
          id={fid("email")}
          name="email"
          type="email"
          maxLength={200}
          defaultValue={reservation?.email ?? ""}
          placeholder="Serve per inviare conferma e promemoria"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor={fid("date")}>Data</label>
        <input
          id={fid("date")}
          name="date"
          type="date"
          required
          defaultValue={reservation?.date ?? defaultDate ?? todayValue()}
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor={fid("time")}>Ora {type === "porchetta" ? "(ritiro, facoltativa)" : ""}</label>
        <input id={fid("time")} name="time" type="time" defaultValue={reservation?.time ?? ""} className={inputCls} />
      </div>

      {type === "table" && (
        <div>
          <label className={labelCls} htmlFor={fid("guests")}>Ospiti</label>
          <input
            id={fid("guests")}
            name="guests"
            type="number"
            min={1}
            max={100}
            defaultValue={reservation?.guests ?? ""}
            className={inputCls}
          />
        </div>
      )}

      {type === "porchetta" && (
        <div>
          <label className={labelCls} htmlFor={fid("quantityKg")}>Quantità (kg)</label>
          <input
            id={fid("quantityKg")}
            name="quantityKg"
            type="number"
            step="0.5"
            min={0.5}
            max={200}
            required
            defaultValue={reservation?.quantityKg ?? ""}
            className={inputCls}
          />
        </div>
      )}

      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={fid("notes")}>Note del cliente</label>
        <textarea id={fid("notes")} name="notes" rows={2} defaultValue={reservation?.notes ?? ""} className={inputCls} />
      </div>

      {!editing && (
        <>
          <div>
            <label className={labelCls} htmlFor={fid("status")}>Stato iniziale</label>
            <select id={fid("status")} name="status" defaultValue="confirmed" className={inputCls}>
              <option value="confirmed">Confermata</option>
              <option value="pending">In attesa</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor={fid("adminNotes")}>Note interne</label>
            <input id={fid("adminNotes")} name="adminNotes" maxLength={2000} className={inputCls} />
          </div>
        </>
      )}

      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm font-medium text-brown-900">
          <input type="checkbox" name="notifyCustomer" className="h-4 w-4 rounded accent-brown-950" />
          Invia {editing ? "il riepilogo aggiornato" : "la conferma"} al cliente via email
        </label>
        <p className="mt-1 text-xs text-brown-800/60">
          Richiede un indirizzo email. Per una prenotazione presa al telefono di solito non serve.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <PendingButton>{editing ? "Salva modifiche" : "Crea prenotazione"}</PendingButton>
        {onDone}
      </div>
    </ActionForm>
  );
}
