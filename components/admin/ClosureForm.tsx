import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { inputCls, labelCls } from "@/components/admin/ui";
import { saveClosure } from "@/lib/admin/fulfilment-actions";
import type { ShopClosureRow, ShopRow } from "@/lib/db/schema";

/**
 * The create/edit form for one closure. Same fields either way — a new closure
 * is one with no id — so the row's "Modifica" and the page's "Nuova chiusura"
 * cannot drift apart.
 */
export function ClosureForm({
  closure,
  shops,
  today,
  defaultShop,
}: {
  closure?: ShopClosureRow;
  shops: ShopRow[];
  today: string;
  /** Pre-selected sede for a new closure (from `?negozio=`, linked from Negozi). */
  defaultShop?: string;
}) {
  const key = closure?.id ?? "new";
  return (
    <ActionForm action={saveClosure} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {closure && <input type="hidden" name="id" value={closure.id} />}

      <div>
        <label className={labelCls} htmlFor={`from-${key}`}>
          Dal
        </label>
        <input
          id={`from-${key}`}
          type="date"
          name="fromDate"
          required
          // An existing closure may already be under way, so only a new one is
          // pinned to today onwards; the action refuses a past end either way.
          min={closure ? undefined : today}
          defaultValue={closure?.fromDate ?? today}
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls} htmlFor={`to-${key}`}>
          Al (compreso)
        </label>
        <input
          id={`to-${key}`}
          type="date"
          name="toDate"
          min={closure?.fromDate ?? today}
          defaultValue={closure && closure.toDate !== closure.fromDate ? closure.toDate : ""}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brown-800/70">Lascia vuoto per un solo giorno.</p>
      </div>

      <div>
        <label className={labelCls} htmlFor={`shop-${key}`}>
          Sede
        </label>
        <select
          id={`shop-${key}`}
          name="shopSlug"
          defaultValue={closure?.shopSlug ?? defaultShop ?? ""}
          className={inputCls}
        >
          <option value="">Tutte le sedi</option>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls} htmlFor={`reason-${key}`}>
          Motivo
        </label>
        <input
          id={`reason-${key}`}
          name="reason"
          maxLength={200}
          defaultValue={closure?.reason ?? ""}
          placeholder="es. Ferie estive, Ferragosto, lavori"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brown-800/70">Mostrato al cliente quando la data viene rifiutata.</p>
      </div>

      <fieldset className="sm:col-span-2">
        <legend className={labelCls}>Orario (facoltativo)</legend>
        {/* A closure of just the afternoon — inventory, a funeral, the
            village feast — used to need the whole day, so the morning's
            bookings were turned away for nothing. */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-brown-800/70" htmlFor={`start-${key}`}>
              Dalle
            </label>
            <input
              id={`start-${key}`}
              type="time"
              name="startTime"
              step={300}
              defaultValue={closure?.startTime ?? ""}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-brown-800/70" htmlFor={`end-${key}`}>
              Alle
            </label>
            <input
              id={`end-${key}`}
              type="time"
              name="endTime"
              step={300}
              defaultValue={closure?.endTime ?? ""}
              className={inputCls}
            />
          </div>
          <p className="pb-3 text-xs text-brown-800/70">
            Lascia vuoto per tutto il giorno. Con un orario restano prenotabili le ore fuori dalla fascia.
          </p>
        </div>
      </fieldset>

      <fieldset className="sm:col-span-2">
        <legend className={labelCls}>Cosa si ferma</legend>
        {/* Two flags rather than one because the cases genuinely differ: a
            kitchen refit stops table bookings while the counter still hands over
            orders already paid for, and a van off the road is the reverse. */}
        <div className="flex flex-wrap gap-5">
          <label className="inline-flex items-center gap-2 text-sm text-brown-900">
            <input type="hidden" name="blocksReservations" value="false" />
            <input
              type="checkbox"
              name="blocksReservations"
              value="true"
              defaultChecked={closure?.blocksReservations ?? true}
              className="h-5 w-5 rounded accent-brown-950"
            />
            Prenotazioni (tavolo, porchetta, ordini speciali)
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-brown-900">
            <input type="hidden" name="blocksPickup" value="false" />
            <input
              type="checkbox"
              name="blocksPickup"
              value="true"
              defaultChecked={closure?.blocksPickup ?? true}
              className="h-5 w-5 rounded accent-brown-950"
            />
            Ritiri e consegne
          </label>
        </div>
      </fieldset>

      <div className="sm:col-span-2">
        <PendingButton>{closure ? "Salva chiusura" : "Aggiungi chiusura"}</PendingButton>
      </div>
    </ActionForm>
  );
}
