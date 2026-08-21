import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, euro, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { adminGetDeliveryZones, adminGetPickupSlots, adminGetShops } from "@/lib/admin/queries";
import {
  saveDeliveryZone,
  toggleDeliveryZoneActive,
  deleteDeliveryZone,
  savePickupSlot,
  deletePickupSlot,
  generatePickupSlots,
} from "@/lib/admin/fulfilment-actions";
import { isAdmin } from "@/lib/auth/session";
import { FULFILMENT_LABEL, WEEKDAY_NAME } from "@/lib/fulfilment";
import type { DeliveryZoneRow, PickupSlotRow, ShopRow } from "@/lib/db/schema";
import type { ZoneWithUsage } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

/**
 * Where orders can go, and when they can be collected.
 *
 * Three tabs because the three are configured at different times by different
 * people: the pickup schedule follows the opening hours, the delivery round is a
 * commercial decision about which streets the van covers, and courier rates come
 * off a price sheet. Putting them on one page would mean scrolling past two
 * things you are not doing.
 */

const BASE = "/admin/fulfilment";
const TABS = [
  { value: "ritiro", label: "Ritiro" },
  { value: "consegna", label: "Consegna a domicilio" },
  { value: "spedizione", label: "Spedizione" },
] as const;

type Tab = (typeof TABS)[number]["value"];
type SP = { searchParams: Promise<{ tab?: string }> };

const euroValue = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2);

/** The create/edit form for one zone. Same fields either way — a new zone is
 *  just one with no id, so there is one form to keep correct rather than two. */
function ZoneForm({
  mode,
  zone,
  shops,
}: {
  mode: "delivery" | "shipping";
  zone?: DeliveryZoneRow;
  shops: ShopRow[];
}) {
  return (
    <ActionForm action={saveDeliveryZone} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {zone && <input type="hidden" name="id" value={zone.id} />}
      <input type="hidden" name="mode" value={mode} />

      <div>
        <label className={labelCls}>Nome della zona</label>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={zone?.name ?? ""}
          placeholder={mode === "delivery" ? "Ancona centro" : "Resto d'Italia"}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Ordine di visualizzazione</label>
        <input
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={zone?.sortOrder ?? 0}
          className={inputCls}
        />
      </div>

      <div className="sm:col-span-2">
        <label className={labelCls}>CAP serviti</label>
        <textarea
          name="postcodes"
          rows={2}
          defaultValue={(zone?.postcodes ?? []).join(" ")}
          placeholder="60121 60122 60123 — oppure un prefisso come 601"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brown-800/60">
          Uno per riga o separati da spazi. Vale anche un prefisso: <code>601</code> copre tutti i
          CAP che iniziano così. <strong>Lascia vuoto per «ovunque»</strong> — la zona più specifica
          vince sempre, quindi una zona vuota fa da riserva per i CAP non elencati altrove.
        </p>
      </div>

      <div>
        <label className={labelCls}>Costo (€)</label>
        <input
          name="feeEuros"
          type="number"
          step="0.01"
          min={0}
          defaultValue={euroValue(zone?.feeCents ?? 0)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Gratis oltre (€)</label>
        <input
          name="freeOverEuros"
          type="number"
          step="0.01"
          min={0}
          defaultValue={euroValue(zone?.freeOverCents)}
          placeholder="mai"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Ordine minimo (€)</label>
        <input
          name="minOrderEuros"
          type="number"
          step="0.01"
          min={0}
          defaultValue={euroValue(zone?.minOrderCents ?? 0)}
          placeholder="nessuno"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Supplemento al kg (€)</label>
        <input
          name="perKgEuros"
          type="number"
          step="0.01"
          min={0}
          defaultValue={euroValue(zone?.perKgCents)}
          placeholder="nessuno"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brown-800/60">
          Si applica solo ai prodotti venduti a peso: una porchetta da 4 kg costa più di un vasetto
          di sugo, che è l&apos;unica cosa che il costo fisso non sapeva dire.
        </p>
      </div>

      <div>
        <label className={labelCls}>Preavviso (ore)</label>
        <input
          name="leadTimeHours"
          type="number"
          min={0}
          defaultValue={zone?.leadTimeHours ?? 0}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Sede che serve la zona</label>
        <select name="shopSlug" defaultValue={zone?.shopSlug ?? ""} className={inputCls}>
          <option value="">Nessuna in particolare</option>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className={labelCls}>Nota per il cliente</label>
        <input
          name="note"
          maxLength={300}
          defaultValue={zone?.note ?? ""}
          placeholder="Consegne il martedì e il venerdì pomeriggio"
          className={inputCls}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-brown-950 sm:col-span-2">
        <input type="checkbox" name="active" defaultChecked={zone?.active ?? true} />
        Attiva (offerta al checkout)
      </label>

      <div className="sm:col-span-2">
        <PendingButton tone="dark">{zone ? "Salva zona" : "Crea zona"}</PendingButton>
      </div>
    </ActionForm>
  );
}

function ZoneList({ zones, shops, mode }: { zones: ZoneWithUsage[]; shops: ShopRow[]; mode: "delivery" | "shipping" }) {
  const rows = zones.filter((z) => z.mode === mode);
  return (
    <div className="space-y-4">
      {rows.length === 0 && (
        <Panel>
          <p className="text-brown-800/70">
            {mode === "delivery"
              ? "Nessuna zona di consegna: finché non ne crei una, la consegna a domicilio non compare al checkout."
              : "Nessuna zona di spedizione."}
          </p>
        </Panel>
      )}

      {rows.map((z) => (
        <Panel key={z.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="font-display text-lg text-brown-950">
                {z.name}
                {!z.active && (
                  <span className="ml-2 rounded-full bg-brown-900/10 px-2.5 py-0.5 text-[10px] font-bold tracking-widest text-brown-800/70 uppercase">
                    sospesa
                  </span>
                )}
              </h3>
              <p className="mt-0.5 text-sm text-brown-800/70">
                {z.postcodes.length > 0 ? z.postcodes.join(", ") : "tutti i CAP non coperti altrove"}
                {" · "}
                {z.feeCents === 0 ? "gratis" : euro(z.feeCents)}
                {z.perKgCents ? ` + ${euro(z.perKgCents)}/kg` : ""}
                {z.freeOverCents != null ? ` · gratis oltre ${euro(z.freeOverCents)}` : ""}
                {z.minOrderCents > 0 ? ` · minimo ${euro(z.minOrderCents)}` : ""}
                {z.leadTimeHours > 0 ? ` · preavviso ${z.leadTimeHours} h` : ""}
              </p>
              {z.note && <p className="mt-1 text-sm text-brown-800/60">{z.note}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-brown-800/50">
                {z.orderCount} {z.orderCount === 1 ? "ordine" : "ordini"}
              </span>
              <ActionForm action={toggleDeliveryZoneActive} className="inline-flex">
                <input type="hidden" name="id" value={z.id} />
                <input type="hidden" name="active" value={z.active ? "false" : "true"} />
                <PendingButton tone="dark">{z.active ? "Sospendi" : "Riattiva"}</PendingButton>
              </ActionForm>
              {/* Only offered where it can succeed: the foreign key is RESTRICT,
                  so a zone that has priced an order cannot be deleted at all. */}
              {z.orderCount === 0 && (
                <DeleteForm action={deleteDeliveryZone} id={z.id}>Elimina</DeleteForm>
              )}
            </div>
          </div>

          <details className="mt-3 border-t border-brown-900/10 pt-3">
            <summary className="w-fit cursor-pointer text-[11px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
              Modifica
            </summary>
            <div className="mt-3">
              <ZoneForm mode={mode} zone={z} shops={shops} />
            </div>
          </details>
        </Panel>
      ))}

      <Panel>
        <details>
          <summary className="w-fit cursor-pointer text-[11px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
            + Nuova zona
          </summary>
          <div className="mt-4">
            <ZoneForm mode={mode} shops={shops} />
          </div>
        </details>
      </Panel>
    </div>
  );
}

function SlotRow({ slot }: { slot: PickupSlotRow }) {
  return (
    // The delete sits *beside* the save form, not inside it: nested <form>
    // elements are invalid HTML and the inner one simply would not submit.
    <div className="flex flex-wrap items-end gap-3 py-2">
      <ActionForm action={savePickupSlot} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={slot.id} />
        <input type="hidden" name="shopSlug" value={slot.shopSlug} />
        <input type="hidden" name="weekday" value={slot.weekday} />
        <span className="w-24 pb-3 text-sm font-semibold text-brown-950 capitalize">
          {WEEKDAY_NAME[slot.weekday]}
        </span>
        <div>
          <label className={labelCls}>Dalle</label>
          <input name="startTime" defaultValue={slot.startTime} className={`${inputCls} w-24`} />
        </div>
        <div>
          <label className={labelCls}>Alle</label>
          <input name="endTime" defaultValue={slot.endTime} className={`${inputCls} w-24`} />
        </div>
        <div>
          <label className={labelCls}>Ordini max</label>
          <input
            name="capacityOrders"
            type="number"
            min={1}
            defaultValue={slot.capacityOrders ?? ""}
            placeholder="∞"
            className={`${inputCls} w-24`}
          />
        </div>
        <div>
          <label className={labelCls}>Preavviso (h)</label>
          <input
            name="cutoffHours"
            type="number"
            min={0}
            defaultValue={slot.cutoffHours}
            className={`${inputCls} w-24`}
          />
        </div>
        <label className="flex items-center gap-2 pb-3 text-sm text-brown-950">
          <input type="checkbox" name="active" defaultChecked={slot.active} />
          Attiva
        </label>
        <div className="pb-1">
          <PendingButton tone="dark">Salva</PendingButton>
        </div>
      </ActionForm>
      <div className="pb-1">
        <DeleteForm action={deletePickupSlot} id={slot.id}>
          Elimina
        </DeleteForm>
      </div>
    </div>
  );
}

export default async function AdminFulfilment({ searchParams }: SP) {
  // Prices and serving areas — admin-only, like the catalogue settings they sit
  // beside.
  if (!(await isAdmin())) redirect("/admin");

  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.value === sp.tab) ? (sp.tab as Tab) : "ritiro";

  const [zones, slots, shops] = await Promise.all([
    adminGetDeliveryZones(),
    adminGetPickupSlots(),
    adminGetShops(),
  ]);

  return (
    <div>
      <AdminHeader
        title="Ritiro, consegna e spedizione"
        subtitle="Fasce di ritiro, zone di consegna e tariffe"
        action={
          <Link
            href="/admin/fulfilment/oggi"
            className="rounded-full bg-gold px-4 py-2 text-xs font-bold tracking-widest text-on-gold uppercase hover:bg-gold-dark"
          >
            Ritiri e consegne di oggi
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "ritiro" ? BASE : `${BASE}?tab=${t.value}`}
            className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              tab === t.value
                ? "bg-brown-950 text-cream"
                : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "ritiro" && (
        <div className="space-y-6">
          <Panel>
            <p className="text-sm text-brown-800/70">
              Una sede <strong>senza fasce</strong> funziona come prima: il cliente sceglie il
              negozio e nessun orario. Appena aggiungi una fascia, al checkout compare la scelta
              dell&apos;orario e diventa obbligatoria — e la pagina{" "}
              <Link href="/admin/fulfilment/oggi" className="underline">
                Ritiri e consegne
              </Link>{" "}
              raggruppa la giornata per fascia.
            </p>
          </Panel>

          {shops.map((shop) => {
            const mine = slots.filter((s) => s.shopSlug === shop.slug);
            const byDay = new Map<number, PickupSlotRow[]>();
            for (const s of mine) byDay.set(s.weekday, [...(byDay.get(s.weekday) ?? []), s]);
            return (
              <Panel key={shop.slug}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brown-900/10 pb-3">
                  <h2 className="font-display text-xl text-brown-950">{shop.name}</h2>
                  <span className="text-xs font-bold tracking-widest text-brown-800/60 uppercase">
                    {mine.length} {mine.length === 1 ? "fascia" : "fasce"}
                  </span>
                </div>

                {mine.length === 0 ? (
                  <p className="py-3 text-sm text-brown-800/60">
                    Nessuna fascia: il ritiro resta senza orario.
                  </p>
                ) : (
                  <div className="divide-y divide-brown-900/10">
                    {[1, 2, 3, 4, 5, 6, 7].flatMap((d) =>
                      (byDay.get(d) ?? []).map((s) => <SlotRow key={s.id} slot={s} />),
                    )}
                  </div>
                )}

                <details className="mt-4 border-t border-brown-900/10 pt-3">
                  <summary className="w-fit cursor-pointer text-[11px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
                    + Aggiungi una fascia
                  </summary>
                  <ActionForm action={savePickupSlot} className="mt-3 flex flex-wrap items-end gap-3">
                    <input type="hidden" name="shopSlug" value={shop.slug} />
                    <div>
                      <label className={labelCls}>Giorno</label>
                      <select name="weekday" defaultValue="6" className={inputCls}>
                        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                          <option key={d} value={d} className="capitalize">
                            {WEEKDAY_NAME[d]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Dalle</label>
                      <input name="startTime" defaultValue="09:00" className={`${inputCls} w-24`} />
                    </div>
                    <div>
                      <label className={labelCls}>Alle</label>
                      <input name="endTime" defaultValue="10:00" className={`${inputCls} w-24`} />
                    </div>
                    <div>
                      <label className={labelCls}>Ordini max</label>
                      <input
                        name="capacityOrders"
                        type="number"
                        min={1}
                        placeholder="∞"
                        className={`${inputCls} w-24`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Preavviso (h)</label>
                      <input
                        name="cutoffHours"
                        type="number"
                        min={0}
                        defaultValue={2}
                        className={`${inputCls} w-24`}
                      />
                    </div>
                    <label className="flex items-center gap-2 pb-3 text-sm text-brown-950">
                      <input type="checkbox" name="active" defaultChecked />
                      Attiva
                    </label>
                    <div className="pb-1">
                      <PendingButton tone="gold">Aggiungi</PendingButton>
                    </div>
                  </ActionForm>
                </details>

                {/* Twenty windows typed by hand is the reason a feature like this
                    stays unconfigured. The opening hours are already structured
                    data, so the schedule can come from them. */}
                <details className="mt-3 border-t border-brown-900/10 pt-3">
                  <summary className="w-fit cursor-pointer text-[11px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
                    Genera dagli orari di apertura
                  </summary>
                  <ActionForm
                    action={generatePickupSlots}
                    className="mt-3 flex flex-wrap items-end gap-3"
                  >
                    <input type="hidden" name="shopSlug" value={shop.slug} />
                    <div>
                      <label className={labelCls}>Durata fascia</label>
                      <select name="minutes" defaultValue="60" className={inputCls}>
                        <option value="30">30 minuti</option>
                        <option value="60">1 ora</option>
                        <option value="120">2 ore</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Ordini max per fascia</label>
                      <input
                        name="capacityOrders"
                        type="number"
                        min={1}
                        placeholder="∞"
                        className={`${inputCls} w-32`}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Preavviso (h)</label>
                      <input
                        name="cutoffHours"
                        type="number"
                        min={0}
                        defaultValue={2}
                        className={`${inputCls} w-24`}
                      />
                    </div>
                    <div className="pb-1">
                      <PendingButton tone="dark">Genera</PendingButton>
                    </div>
                    <p className="w-full text-xs text-brown-800/60">
                      Rigenerare aggiorna le fasce esistenti invece di duplicarle. Gli ordini già
                      prenotati non si spostano: conservano l&apos;orario scelto.
                    </p>
                  </ActionForm>
                </details>
              </Panel>
            );
          })}
        </div>
      )}

      {tab === "consegna" && (
        <div className="space-y-4">
          <Panel>
            <p className="text-sm text-brown-800/70">
              {FULFILMENT_LABEL.delivery} è il giro col furgone della bottega, diverso dalla
              spedizione col corriere: prezzo, preavviso e CAP sono suoi. Compare al checkout
              <strong> solo se esiste almeno una zona attiva</strong>.
            </p>
          </Panel>
          <ZoneList zones={zones} shops={shops} mode="delivery" />
        </div>
      )}

      {tab === "spedizione" && (
        <div className="space-y-4">
          <Panel>
            <p className="text-sm text-brown-800/70">
              Le tariffe stanno qui, non più in Impostazioni: il costo fisso e la soglia di
              spedizione gratuita valevano per tutta Italia. Il primo giro di zone è stato creato
              con quei valori, quindi nulla è cambiato finché non li differenzi. I corrieri e i
              modelli di tracking restano in{" "}
              <Link href="/admin/settings" className="underline">
                Impostazioni
              </Link>
              .
            </p>
          </Panel>
          <ZoneList zones={zones} shops={shops} mode="shipping" />
        </div>
      )}
    </div>
  );
}
