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
  setShopPickupSlotsActive,
  deleteShopPickupSlots,
} from "@/lib/admin/fulfilment-actions";
import { isAdmin } from "@/lib/auth/session";
import { FULFILMENT_LABEL, WEEKDAY_NAME } from "@/lib/fulfilment";
import { isoWeekday } from "@/lib/pickup-slots";
import { dateInRome } from "@/lib/time";
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
type ZoneMode = DeliveryZoneRow["mode"];
type SP = { searchParams: Promise<{ tab?: string }> };

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

const euroValue = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2);

const summaryCls =
  "w-fit cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/70 uppercase hover:text-brown-950";

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-brown-800/70">{children}</p>;
}

function Notice({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  return (
    <p
      className={`rounded-lg px-3 py-2 text-sm ${
        tone === "warn"
          ? "bg-danger-solid/10 text-brown-950"
          : "bg-brown-900/5 text-brown-800/80"
      }`}
    >
      {children}
    </p>
  );
}

// ── Zones ────────────────────────────────────────────────────────────────────

/** The create/edit form for one zone. Same fields either way — a new zone is
 *  just one with no id, so there is one form to keep correct rather than two. */
function ZoneForm({ mode, zone, shops }: { mode: ZoneMode; zone?: DeliveryZoneRow; shops: ShopRow[] }) {
  // The form is rendered once per zone plus once for "new": ids carry the zone
  // id so every label focuses its own field and not the first form's.
  const k = zone ? zone.id : `new-${mode}`;
  const fid = (name: string) => `zone-${k}-${name}`;

  return (
    <ActionForm action={saveDeliveryZone} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {zone && <input type="hidden" name="id" value={zone.id} />}
      <input type="hidden" name="mode" value={mode} />

      <div>
        <label className={labelCls} htmlFor={fid("name")}>
          Nome della zona
        </label>
        <input
          id={fid("name")}
          name="name"
          required
          maxLength={120}
          defaultValue={zone?.name ?? ""}
          placeholder={mode === "delivery" ? "Ancona centro" : "Resto d'Italia"}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("shopSlug")}>
          Sede che serve la zona
        </label>
        <select id={fid("shopSlug")} name="shopSlug" defaultValue={zone?.shopSlug ?? ""} className={inputCls}>
          <option value="">Nessuna in particolare</option>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <Hint>L&apos;ordine viene assegnato a questa sede e compare nel suo foglio di giornata.</Hint>
      </div>

      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={fid("postcodes")}>
          CAP serviti
        </label>
        <textarea
          id={fid("postcodes")}
          name="postcodes"
          rows={2}
          defaultValue={(zone?.postcodes ?? []).join(" ")}
          placeholder="60121 60122 60123 — oppure un prefisso come 601"
          className={inputCls}
        />
        <Hint>
          Uno per riga o separati da spazi. Vale anche un prefisso: <code>601</code> copre tutti i
          CAP che iniziano così. <strong>Lascia vuoto per «ovunque»</strong> — la zona più specifica
          vince sempre, quindi una zona vuota fa da riserva per i CAP non elencati altrove.
        </Hint>
      </div>

      <div>
        <label className={labelCls} htmlFor={fid("fee")}>
          Costo (€)
        </label>
        <input
          id={fid("fee")}
          name="feeEuros"
          type="number"
          step="0.01"
          min={0}
          defaultValue={euroValue(zone?.feeCents ?? 0)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("freeOver")}>
          Gratis oltre (€)
        </label>
        <input
          id={fid("freeOver")}
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
        <label className={labelCls} htmlFor={fid("minOrder")}>
          Ordine minimo (€)
        </label>
        <input
          id={fid("minOrder")}
          name="minOrderEuros"
          type="number"
          step="0.01"
          min={0}
          defaultValue={euroValue(zone?.minOrderCents ?? 0)}
          placeholder="nessuno"
          className={inputCls}
        />
        <Hint>Sotto questa cifra l&apos;ordine viene rifiutato al checkout, non prezzato.</Hint>
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("perKg")}>
          Supplemento al kg (€)
        </label>
        <input
          id={fid("perKg")}
          name="perKgEuros"
          type="number"
          step="0.01"
          min={0}
          defaultValue={euroValue(zone?.perKgCents)}
          placeholder="nessuno"
          className={inputCls}
        />
        <Hint>Si somma al costo, solo sui prodotti venduti a peso.</Hint>
      </div>

      <div>
        <label className={labelCls} htmlFor={fid("leadTime")}>
          Tempi di consegna (ore)
        </label>
        <input
          id={fid("leadTime")}
          name="leadTimeHours"
          type="number"
          min={0}
          max={720}
          defaultValue={zone?.leadTimeHours ?? 0}
          className={inputCls}
        />
        <Hint>
          Solo informativo: il cliente legge «consegna in X h» al checkout. Non blocca l&apos;ordine.
          0 = non mostrato.
        </Hint>
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("sortOrder")}>
          Priorità a parità di CAP
        </label>
        <input
          id={fid("sortOrder")}
          name="sortOrder"
          type="number"
          min={0}
          max={9999}
          defaultValue={zone?.sortOrder ?? 0}
          className={inputCls}
        />
        <Hint>
          Conta solo se due zone coprono lo stesso CAP allo stesso modo: vince il numero più basso.
        </Hint>
      </div>

      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={fid("note")}>
          Nota per il cliente
        </label>
        <input
          id={fid("note")}
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

function ZoneSummary({ zone, shopName }: { zone: ZoneWithUsage; shopName: string | null }) {
  const parts = [
    zone.postcodes.length > 0 ? zone.postcodes.join(", ") : "tutti i CAP non coperti altrove",
    zone.feeCents === 0 ? "gratis" : euro(zone.feeCents) + (zone.perKgCents ? ` + ${euro(zone.perKgCents)}/kg` : ""),
  ];
  if (zone.freeOverCents != null) parts.push(`gratis oltre ${euro(zone.freeOverCents)}`);
  if (zone.minOrderCents > 0) parts.push(`minimo ${euro(zone.minOrderCents)}`);
  if (zone.leadTimeHours > 0) parts.push(`consegna in ${zone.leadTimeHours} h`);
  if (shopName) parts.push(`sede: ${shopName}`);
  return <p className="mt-0.5 text-sm text-brown-800/70">{parts.join(" · ")}</p>;
}

function ZoneList({ zones, shops, mode }: { zones: ZoneWithUsage[]; shops: ShopRow[]; mode: ZoneMode }) {
  const rows = zones.filter((z) => z.mode === mode);
  const active = rows.filter((z) => z.active);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));
  // Two active catch-alls are resolved by priority, then name — silently. Say so.
  const catchAlls = active.filter((z) => z.postcodes.length === 0);

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

      {mode === "shipping" && active.length === 0 && (
        <Notice tone="warn">
          <strong>Attenzione:</strong> senza almeno una zona di spedizione attiva, «Spedizione» resta
          visibile al checkout ma ogni CAP viene rifiutato. Crea o riattiva una zona — anche una sola
          senza CAP per «ovunque».
        </Notice>
      )}

      {catchAlls.length > 1 && (
        <Notice tone="warn">
          <strong>{catchAlls.length} zone attive senza CAP</strong> ({catchAlls.map((z) => z.name).join(", ")}
          ): coprono tutte «ovunque», quindi ne vale una sola — quella con la priorità più bassa.
          Sospendi le altre o assegna loro dei CAP.
        </Notice>
      )}

      {rows.map((z) => (
        <Panel key={z.id}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="font-display text-lg text-brown-950">
                {z.name}
                {!z.active && (
                  <span className="ml-2 rounded-full bg-brown-900/10 px-2.5 py-0.5 text-[11px] font-bold tracking-widest text-brown-800/70 uppercase">
                    sospesa
                  </span>
                )}
              </h3>
              <ZoneSummary zone={z} shopName={z.shopSlug ? (shopName.get(z.shopSlug) ?? z.shopSlug) : null} />
              {z.note && <p className="mt-1 text-sm text-brown-800/70">{z.note}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-brown-800/70">
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
                <DeleteForm action={deleteDeliveryZone} id={z.id}>
                  Elimina
                </DeleteForm>
              )}
            </div>
          </div>

          <details className="mt-3 border-t border-brown-900/10 pt-3">
            <summary className={summaryCls}>Modifica</summary>
            <div className="mt-3">
              <ZoneForm mode={mode} zone={z} shops={shops} />
            </div>
          </details>
        </Panel>
      ))}

      <Panel>
        <details>
          <summary className={summaryCls}>+ Nuova zona</summary>
          <div className="mt-4">
            <ZoneForm mode={mode} shops={shops} />
          </div>
        </details>
      </Panel>
    </div>
  );
}

// ── Pickup windows ───────────────────────────────────────────────────────────

/** The editable fields shared by the row form and the "add" form. `k` keys the
 *  ids, because both forms repeat down the page. */
function SlotFields({
  k,
  slot,
  buttonTone,
  buttonLabel,
}: {
  k: string;
  slot?: PickupSlotRow;
  buttonTone: "gold" | "dark";
  buttonLabel: string;
}) {
  const fid = (name: string) => `slot-${k}-${name}`;
  return (
    <>
      <div>
        <label className={labelCls} htmlFor={fid("start")}>
          Dalle
        </label>
        <input
          id={fid("start")}
          name="startTime"
          type="time"
          required
          defaultValue={slot?.startTime ?? "09:00"}
          className={`${inputCls} w-28`}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("end")}>
          Alle
        </label>
        <input
          id={fid("end")}
          name="endTime"
          type="time"
          required
          defaultValue={slot?.endTime ?? "10:00"}
          className={`${inputCls} w-28`}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("capacity")}>
          Ordini max
        </label>
        <input
          id={fid("capacity")}
          name="capacityOrders"
          type="number"
          min={1}
          max={999}
          defaultValue={slot?.capacityOrders ?? ""}
          placeholder="∞"
          className={`${inputCls} w-24`}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("cutoff")}>
          Preavviso (h)
        </label>
        <input
          id={fid("cutoff")}
          name="cutoffHours"
          type="number"
          min={0}
          max={720}
          defaultValue={slot?.cutoffHours ?? 2}
          className={`${inputCls} w-24`}
        />
      </div>
      <label className="flex items-center gap-2 pb-3 text-sm text-brown-950">
        <input type="checkbox" name="active" defaultChecked={slot?.active ?? true} />
        Attiva
      </label>
      <div className="pb-1">
        <PendingButton tone={buttonTone}>{buttonLabel}</PendingButton>
      </div>
    </>
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
        <SlotFields k={slot.id} slot={slot} buttonTone="dark" buttonLabel="Salva" />
      </ActionForm>
      <div className="pb-1">
        <DeleteForm action={deletePickupSlot} id={slot.id}>
          Elimina
        </DeleteForm>
      </div>
    </div>
  );
}

function ShopSchedule({
  shop,
  slots,
  todayWeekday,
}: {
  shop: ShopRow;
  slots: PickupSlotRow[];
  todayWeekday: number;
}) {
  const byDay = new Map<number, PickupSlotRow[]>();
  for (const s of slots) byDay.set(s.weekday, [...(byDay.get(s.weekday) ?? []), s]);
  const activeCount = slots.filter((s) => s.active).length;
  const hasHours = !!shop.hoursStructured && shop.hoursStructured.length > 0;
  const hoursHref = `/admin/shops/${shop.id}`;

  return (
    <Panel>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brown-900/10 pb-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="font-display text-xl text-brown-950">{shop.name}</h2>
          <Link href={hoursHref} className="text-xs text-brown-800/70 underline hover:text-brown-950">
            Orari di apertura
          </Link>
        </div>
        <span className="text-xs font-bold tracking-widest text-brown-800/70 uppercase">
          {slots.length} {slots.length === 1 ? "fascia" : "fasce"}
          {slots.length > 0 && activeCount < slots.length ? ` · ${activeCount} attive` : ""}
        </span>
      </div>

      {slots.length > 0 && activeCount === 0 && (
        <div className="mt-3">
          <Notice tone="info">
            Tutte le fasce sono sospese: il ritiro da {shop.name} è offerto senza orario finché non ne
            riattivi almeno una.
          </Notice>
        </div>
      )}

      {slots.length === 0 ? (
        <p className="py-3 text-sm text-brown-800/70">Nessuna fascia: il ritiro resta senza orario.</p>
      ) : (
        <div className="space-y-3 pt-2">
          {WEEKDAYS.filter((d) => byDay.has(d)).map((d) => (
            <div key={d}>
              <h3 className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
                {WEEKDAY_NAME[d]}
              </h3>
              <div className="divide-y divide-brown-900/10">
                {byDay.get(d)!.map((s) => (
                  <SlotRow key={s.id} slot={s} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {slots.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-brown-900/10 pt-3">
          {activeCount > 0 && (
            <ActionForm action={setShopPickupSlotsActive} className="inline-flex">
              <input type="hidden" name="shopSlug" value={shop.slug} />
              <input type="hidden" name="active" value="false" />
              <PendingButton tone="dark">Sospendi tutte</PendingButton>
            </ActionForm>
          )}
          {activeCount < slots.length && (
            <ActionForm action={setShopPickupSlotsActive} className="inline-flex">
              <input type="hidden" name="shopSlug" value={shop.slug} />
              <input type="hidden" name="active" value="true" />
              <PendingButton tone="dark">Riattiva tutte</PendingButton>
            </ActionForm>
          )}
          <ActionForm action={deleteShopPickupSlots} className="inline-flex">
            <input type="hidden" name="shopSlug" value={shop.slug} />
            <PendingButton
              tone="danger"
              confirm={`Eliminare tutte le ${slots.length} fasce di ${shop.name}? Gli ordini già prenotati mantengono il loro orario.`}
            >
              Elimina tutte
            </PendingButton>
          </ActionForm>
        </div>
      )}

      <details className="mt-4 border-t border-brown-900/10 pt-3">
        <summary className={summaryCls}>+ Aggiungi una fascia</summary>
        <ActionForm action={savePickupSlot} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="shopSlug" value={shop.slug} />
          <div>
            <label className={labelCls} htmlFor={`slot-new-${shop.slug}-weekday`}>
              Giorno
            </label>
            <select
              id={`slot-new-${shop.slug}-weekday`}
              name="weekday"
              defaultValue={String(todayWeekday)}
              className={inputCls}
            >
              {WEEKDAYS.map((d) => (
                <option key={d} value={d} className="capitalize">
                  {WEEKDAY_NAME[d]}
                </option>
              ))}
            </select>
          </div>
          <SlotFields k={`new-${shop.slug}`} buttonTone="gold" buttonLabel="Aggiungi" />
        </ActionForm>
      </details>

      {/* Twenty windows typed by hand is the reason a feature like this stays
          unconfigured. The opening hours are already structured data, so the
          schedule can come from them. */}
      <details className="mt-3 border-t border-brown-900/10 pt-3">
        <summary className={summaryCls}>Genera dagli orari di apertura</summary>
        {hasHours ? (
          <ActionForm action={generatePickupSlots} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="shopSlug" value={shop.slug} />
            <div>
              <label className={labelCls} htmlFor={`gen-${shop.slug}-minutes`}>
                Durata fascia
              </label>
              <select id={`gen-${shop.slug}-minutes`} name="minutes" defaultValue="60" className={inputCls}>
                <option value="30">30 minuti</option>
                <option value="60">1 ora</option>
                <option value="120">2 ore</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor={`gen-${shop.slug}-capacity`}>
                Ordini max per fascia
              </label>
              <input
                id={`gen-${shop.slug}-capacity`}
                name="capacityOrders"
                type="number"
                min={1}
                max={999}
                placeholder="∞"
                className={`${inputCls} w-32`}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor={`gen-${shop.slug}-cutoff`}>
                Preavviso (h)
              </label>
              <input
                id={`gen-${shop.slug}-cutoff`}
                name="cutoffHours"
                type="number"
                min={0}
                max={720}
                defaultValue={2}
                className={`${inputCls} w-24`}
              />
            </div>
            <div className="pb-1">
              <PendingButton
                tone="dark"
                confirm={
                  slots.length > 0
                    ? `Sostituire le ${slots.length} fasce di ${shop.name} con quelle ricavate dagli orari di apertura?`
                    : undefined
                }
              >
                Genera
              </PendingButton>
            </div>
            <p className="w-full text-xs text-brown-800/70">
              <strong>Sostituisce</strong> tutte le fasce della sede con quelle ricavate dagli orari di
              apertura. Gli ordini già prenotati non si spostano: conservano l&apos;orario scelto.
            </p>
          </ActionForm>
        ) : (
          <div className="mt-3">
            <Notice tone="info">
              {shop.name}
              {" non ha orari di apertura strutturati, quindi non c'è nulla da cui generare. "}
              <Link href={hoursHref} className="underline">
                Impostali nella scheda della sede
              </Link>
              , oppure aggiungi le fasce a mano.
            </Notice>
          </div>
        )}
      </details>
    </Panel>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

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
  const todayWeekday = isoWeekday(dateInRome());

  return (
    <div>
      <AdminHeader
        title="Zone e fasce"
        subtitle="Fasce di ritiro, zone di consegna e tariffe di spedizione"
        action={
          <Link
            href="/admin/fulfilment/oggi"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold px-4 py-2 text-xs font-bold tracking-widest text-on-gold uppercase hover:bg-gold-dark"
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
            aria-current={tab === t.value ? "page" : undefined}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
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
              Una sede <strong>senza fasce attive</strong>
              {" offre il ritiro senza orario. Appena una "}
              fascia è attiva, al checkout la scelta dell&apos;orario diventa obbligatoria e la pagina{" "}
              <Link href="/admin/fulfilment/oggi" className="underline">
                Ritiri e consegne
              </Link>{" "}
              raggruppa la giornata per fascia. Nei giorni di{" "}
              <Link href="/admin/chiusure" className="underline">
                chiusura
              </Link>{" "}
              le fasce non vengono offerte.
            </p>
          </Panel>

          {shops.map((shop) => (
            <ShopSchedule
              key={shop.slug}
              shop={shop}
              slots={slots.filter((s) => s.shopSlug === shop.slug)}
              todayWeekday={todayWeekday}
            />
          ))}
        </div>
      )}

      {tab === "consegna" && (
        <div className="space-y-4">
          <Panel>
            <p className="text-sm text-brown-800/70">
              {FULFILMENT_LABEL.delivery} è il giro col furgone della bottega, diverso dalla
              spedizione col corriere: prezzo, tempi e CAP sono suoi. Compare al checkout
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
              Ogni zona ha la sua tariffa, la soglia «gratis oltre» e i CAP che copre; un CAP senza
              zona viene rifiutato al checkout. I corrieri e i modelli di tracking restano in{" "}
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
