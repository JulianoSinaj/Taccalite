import Link from "next/link";
import { AdminHeader, Panel, BackLink, euro, fmtDate } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { PrintButton } from "@/components/admin/PrintButton";
import { getExpiringBatches, adminGetShops, getOrdersForLot } from "@/lib/admin/queries";
import { writeOffBatch } from "@/lib/admin/batch-actions";
import { shopScope, lockShop } from "@/lib/admin/scope";
import { dateInRome } from "@/lib/time";

export const dynamic = "force-dynamic";

const WINDOWS = [
  { days: 0, label: "Solo scaduti" },
  { days: 7, label: "7 giorni" },
  { days: 14, label: "14 giorni" },
  { days: 30, label: "30 giorni" },
];

/** ISO date `days` from today (UTC math — DST-safe). */
function isoIn(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

type SP = { searchParams: Promise<{ giorni?: string; negozio?: string; lotto?: string }> };

/**
 * What has to be sold, moved or thrown.
 *
 * Lot expiry is an HACCP obligation for fresh salumi and formaggi, and until
 * batches existed there was nowhere in the platform to ask the question — it
 * lived on paper delivery notes. Print-friendly, because this is a sheet
 * somebody walks the cold room with.
 */
export default async function ExpiringBatches({ searchParams }: SP) {
  const sp = await searchParams;
  const days = WINDOWS.some((w) => String(w.days) === sp.giorni) ? Number(sp.giorni) : 7;
  // The chips are a filter; the scope is a boundary. This page both listed the
  // other location's lots and offered the write-off button on them — a
  // cross-location inventory write, one click from a URL nobody had to guess.
  const scope = await shopScope();
  const shopFilter = lockShop(sp.negozio, scope) ?? "all";

  const today = dateInRome();
  const through = isoIn(today, days);

  // The recall lookup: which customers took this lot away.
  const lotQuery = (sp.lotto ?? "").trim();

  const [rows, allShops, recall] = await Promise.all([
    getExpiringBatches(through, true, scope),
    adminGetShops(),
    lotQuery ? getOrdersForLot(lotQuery, scope) : Promise.resolve([]),
  ]);
  const shops = scope ? allShops.filter((s) => s.slug === scope) : allShops;
  const shopName = new Map(allShops.map((s) => [s.slug, s.name]));
  const visible = shopFilter === "all" ? rows : rows.filter((r) => r.shopSlug === shopFilter);

  const expired = visible.filter((r) => r.batch.expiryDate! < today);
  const soon = visible.filter((r) => r.batch.expiryDate! >= today);
  const valueOf = (list: typeof visible) =>
    list.reduce((s, r) => s + (r.batch.unitCostCents ?? 0) * r.batch.remaining, 0);

  const href = (params: Record<string, string>) => {
    const qs = new URLSearchParams({
      giorni: String(days),
      negozio: shopFilter,
      ...(lotQuery ? { lotto: lotQuery } : {}),
      ...params,
    });
    for (const [k, v] of [...qs.entries()]) if (v === "all") qs.delete(k);
    const s = qs.toString();
    return `/admin/products/scadenze${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <BackLink href="/admin/products">Prodotti</BackLink>
      <AdminHeader
        title="Scadenze"
        subtitle={`${visible.length} lotti in giacenza con scadenza entro il ${fmtDate(through)}`}
        action={
          <div className="flex flex-wrap gap-2">
            {/* The lot register is the HACCP traceability record — which lot,
                from whom, expiring when — and it could only be read one product
                at a time in the batch panel. */}
            <a
              href="/api/admin/export/batches"
              download
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15 print:hidden"
            >
              Registro lotti CSV
            </a>
            <PrintButton>Stampa elenco</PrintButton>
          </div>
        }
      />

      {/* Traceability, the way a recall actually arrives: somebody telephones
          with a lot code off a packet, and the shop has to know within the hour
          who took that lot away. `consumeBatchesFefo` has always known which
          lots a sale drew on and both callers used to discard it, so this could
          only be answered from paper delivery notes and memory. */}
      <Panel className="mb-6 print:hidden">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="giorni" value={String(days)} />
          {shopFilter !== "all" && <input type="hidden" name="negozio" value={shopFilter} />}
          <div className="min-w-0 flex-1">
            <label
              htmlFor="lotto"
              className="mb-1.5 block text-[0.6875rem] font-bold tracking-widest text-brown-950/70 uppercase"
            >
              Richiamo: chi ha ricevuto un lotto
            </label>
            <input
              id="lotto"
              name="lotto"
              defaultValue={lotQuery}
              placeholder="Codice del lotto, come stampato sulla confezione"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="min-h-11 w-full rounded-lg border border-brown-900/15 bg-cream/40 px-3 py-2.5 text-sm text-brown-950 focus:border-gold-dark focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-5 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
          >
            Cerca
          </button>
        </form>

        {lotQuery && (
          <div className="mt-4 border-t border-brown-900/10 pt-4">
            {recall.length === 0 ? (
              <p className="text-sm text-brown-800/70">
                Nessun ordine risulta aver ricevuto il lotto «{lotQuery}». I lotti usciti sono
                registrati da quando la tracciabilità è attiva: per le vendite precedenti restano
                le bolle cartacee.
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm font-semibold text-brown-950">
                  {recall.length === 1
                    ? "1 ordine ha ricevuto questo lotto"
                    : `${recall.length} ordini hanno ricevuto questo lotto`}
                </p>
                <ul className="space-y-2">
                  {recall.map((r) => (
                    <li
                      key={`${r.orderId}-${r.productName}-${r.movedAt?.getTime() ?? 0}`}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
                    >
                      <Link
                        href={`/admin/orders/${r.orderId}`}
                        className="font-semibold text-brown-950 underline decoration-brown-900/30 underline-offset-2"
                      >
                        {r.orderNumber}
                      </Link>
                      <span className="text-brown-950">{r.customerName}</span>
                      <span className="text-brown-800/70">{r.productName}</span>
                      {r.phone && <span className="text-brown-800/70">{r.phone}</span>}
                      <span className="text-brown-800/70">{r.email}</span>
                      <span className="text-xs text-brown-800/50">{fmtDate(r.movedAt)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Panel>

      <div className="mb-6 flex flex-wrap gap-2 print:hidden">
        {WINDOWS.map((w) => (
          <Link
            key={w.days}
            href={href({ giorni: String(w.days) })}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              days === w.days ? "bg-brown-950 text-cream" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            {w.label}
          </Link>
        ))}
        <span className="mx-1 w-px self-stretch bg-brown-900/10" />
        <Link
          href={href({ negozio: "all" })}
          className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
            shopFilter === "all" ? "bg-brown-950 text-cream" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
          }`}
        >
          Tutte le sedi
        </Link>
        {shops.map((s) => (
          <Link
            key={s.slug}
            href={href({ negozio: s.slug })}
            className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              shopFilter === s.slug
                ? "bg-brown-950 text-cream"
                : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            Nessun lotto in scadenza in questa finestra. I lotti si registrano dalla scheda di ogni
            prodotto.
          </p>
        </Panel>
      ) : (
        <div className="space-y-8">
          {[
            { title: "Già scaduti", list: expired, tone: "border-danger/40" },
            { title: `In scadenza entro il ${fmtDate(through)}`, list: soon, tone: "" },
          ]
            .filter((g) => g.list.length > 0)
            .map((g) => (
              <section key={g.title} className="break-inside-avoid">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-brown-900/10 pb-2">
                  <h2 className="font-display text-xl text-brown-950">{g.title}</h2>
                  <span className="text-xs font-bold tracking-widest text-brown-800/70 uppercase">
                    {g.list.length} lotti · valore a costo {euro(valueOf(g.list))}
                  </span>
                </div>
                <div className="space-y-2">
                  {g.list.map(({ batch: b, productName, productSlug, shopSlug }) => (
                    <Panel
                      key={b.id}
                      className={`flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between ${g.tone}`}
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-widest uppercase ${
                            b.expiryDate! < today
                              ? "bg-danger-solid/15 text-danger-soft-fg"
                              : "bg-warn-soft text-warn-soft-fg"
                          }`}
                        >
                          {fmtDate(b.expiryDate)}
                        </span>
                        <Link
                          href={`/admin/products/${b.productId}`}
                          className="font-semibold text-brown-950 hover:underline print:no-underline"
                        >
                          {productName}
                        </Link>
                        <span className="text-sm text-brown-800/70">
                          lotto {b.lotCode || "—"} · {b.remaining} pz
                        </span>
                        <span className="text-sm text-brown-800/70">
                          · {shopName.get(shopSlug) ?? shopSlug}
                        </span>
                        {b.supplier && <span className="text-sm text-brown-800/70">· {b.supplier}</span>}
                        <span className="sr-only">{productSlug}</span>
                      </div>
                      <ActionForm action={writeOffBatch} className="print:hidden">
                        <input type="hidden" name="id" value={b.id} />
                        <input
                          type="hidden"
                          name="reason"
                          value={b.expiryDate! < today ? "Scaduto" : "Ritirato prima della scadenza"}
                        />
                        <PendingButton
                          tone="danger"
                          confirm={`Scaricare le ${b.remaining} unità del lotto ${b.lotCode || "senza codice"} di ${productName}?`}
                        >
                          Scarica
                        </PendingButton>
                      </ActionForm>
                    </Panel>
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
