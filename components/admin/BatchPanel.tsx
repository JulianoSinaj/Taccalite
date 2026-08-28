import { Panel, inputCls, labelCls, euro, fmtDate } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { receiveBatch, writeOffBatch, correctBatchRemaining } from "@/lib/admin/batch-actions";
import type { ProductBatchRow } from "@/lib/db/schema";

/**
 * Lot + expiry management for one product.
 *
 * `today` is passed in rather than computed here: the React Compiler lint
 * forbids `new Date()` in a render body, and the page already resolves the
 * business-timezone date.
 */
export function BatchPanel({
  productId,
  batches,
  today,
}: {
  productId: string;
  batches: ProductBatchRow[];
  today: string;
}) {
  const open = batches.filter((b) => b.remaining > 0);
  const spent = batches.filter((b) => b.remaining <= 0).slice(0, 10);

  /** How a lot's date reads relative to today. */
  const dateState = (expiry: string | null) => {
    if (!expiry) return { tone: "text-brown-800/70", label: "senza scadenza" };
    if (expiry < today) return { tone: "font-bold text-danger-soft-fg", label: `scaduto il ${fmtDate(expiry)}` };
    // Within a week is the window a shop can still act on.
    const soon = new Date(`${today}T00:00:00`);
    soon.setDate(soon.getDate() + 7);
    if (expiry <= soon.toISOString().slice(0, 10)) {
      return { tone: "font-semibold text-warn", label: `scade il ${fmtDate(expiry)}` };
    }
    return { tone: "text-brown-800/70", label: `scade il ${fmtDate(expiry)}` };
  };

  return (
    <Panel>
      <h3 className="font-display mb-1 text-lg text-brown-950">Lotti e scadenze</h3>
      <p className="mb-4 text-xs text-brown-800/70">
        Registra i lotti in arrivo con il loro codice e la scadenza. Le vendite consumano prima i lotti
        che scadono per primi (FEFO), così la tracciabilità resta allineata alla giacenza.
      </p>

      <ActionForm action={receiveBatch} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="productId" value={productId} />
        <div>
          <label className={labelCls} htmlFor="lot-code">
            Lotto
          </label>
          <input id="lot-code" name="lotCode" placeholder="es. L2026-114" className={`${inputCls} w-36`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="lot-expiry">
            Scadenza
          </label>
          <input id="lot-expiry" name="expiryDate" type="date" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="lot-qty">
            Quantità
          </label>
          <input
            id="lot-qty"
            name="quantity"
            type="number"
            min={1}
            required
            className={`${inputCls} w-24`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="lot-cost">
            Costo unitario (€)
          </label>
          <input
            id="lot-cost"
            name="unitCostEuros"
            type="number"
            step="0.01"
            min={0}
            className={`${inputCls} w-32`}
          />
        </div>
        <div className="min-w-40 flex-1">
          <label className={labelCls} htmlFor="lot-supplier">
            Fornitore
          </label>
          <input id="lot-supplier" name="supplier" className={inputCls} />
        </div>
        <PendingButton tone="dark">Registra lotto</PendingButton>
      </ActionForm>
      <p className="mt-2 text-xs text-brown-800/70">
        Registrare un lotto carica anche la giacenza del prodotto.
      </p>

      {open.length > 0 && (
        <div className="scroll-x mt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brown-900/10 text-left text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
                <th scope="col" className="py-2">Lotto</th>
                <th scope="col" className="py-2">Scadenza</th>
                <th scope="col" className="py-2 text-right">Residuo</th>
                <th scope="col" className="py-2">Fornitore</th>
                <th scope="col" className="py-2 text-right">Costo</th>
                <th scope="col" className="py-2 text-right">
                  <span className="sr-only">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brown-900/5">
              {open.map((b) => {
                const state = dateState(b.expiryDate);
                return (
                  <tr key={b.id}>
                    <td className="py-2 font-medium text-brown-950">{b.lotCode || "—"}</td>
                    <td className={`py-2 whitespace-nowrap ${state.tone}`}>{state.label}</td>
                    <td className="py-2 text-right">
                      <ActionForm action={correctBatchRemaining} className="inline-flex items-center gap-1">
                        <input type="hidden" name="id" value={b.id} />
                        <label className="sr-only" htmlFor={`rem-${b.id}`}>
                          Residuo del lotto {b.lotCode || b.id}
                        </label>
                        <input
                          id={`rem-${b.id}`}
                          name="remaining"
                          type="number"
                          min={0}
                          max={b.quantity}
                          defaultValue={b.remaining}
                          className={`${inputCls} w-20 py-1.5 text-right`}
                        />
                        <span className="text-xs text-brown-800/70">/ {b.quantity}</span>
                        <PendingButton tone="dark">OK</PendingButton>
                      </ActionForm>
                    </td>
                    <td className="py-2 text-brown-800/70">{b.supplier || "—"}</td>
                    <td className="py-2 text-right tabular-nums text-brown-800/70">
                      {b.unitCostCents != null ? euro(b.unitCostCents) : "—"}
                    </td>
                    <td className="py-2 text-right">
                      <ActionForm action={writeOffBatch} className="inline-flex">
                        <input type="hidden" name="id" value={b.id} />
                        <input
                          type="hidden"
                          name="reason"
                          value={b.expiryDate && b.expiryDate < today ? "Scaduto" : "Lotto scartato"}
                        />
                        <PendingButton
                          tone="danger"
                          confirm={`Scaricare le ${b.remaining} unità rimaste del lotto ${b.lotCode || "senza codice"}? Escono dalla giacenza.`}
                        >
                          Scarica
                        </PendingButton>
                      </ActionForm>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open.length === 0 && (
        <p className="mt-6 rounded-lg bg-cream/60 px-4 py-4 text-center text-sm text-brown-800/70">
          Nessun lotto aperto per questo prodotto.
        </p>
      )}

      {spent.length > 0 && (
        <details className="mt-4">
          <summary className="w-fit cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/70 uppercase hover:text-brown-950">
            Lotti esauriti ({spent.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-brown-800/70">
            {spent.map((b) => (
              <li key={b.id}>
                {b.lotCode || "senza codice"} · {b.quantity} unità
                {b.expiryDate ? ` · scadenza ${fmtDate(b.expiryDate)}` : ""}
                {b.receivedAt ? ` · ricevuto ${fmtDate(b.receivedAt)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}
