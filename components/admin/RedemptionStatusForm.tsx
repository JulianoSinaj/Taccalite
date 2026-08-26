import { ActionForm, PendingButton } from "./ActionForm";
import { inputCls, fmtDateTime } from "./ui";
import { updateRedemptionStatus } from "@/lib/admin/actions";

type RedemptionStatus = "pending" | "fulfilled" | "cancelled";

type Redemption = {
  id: string;
  rewardName: string;
  status: RedemptionStatus;
  fulfilledAt: Date | null;
};

/** The badge wording — the shared labels say "Evaso"/"Annullata", which are
 *  order and reservation words; a reward is handed over, not shipped. */
const REDEMPTION_STATUS_LABEL: Record<RedemptionStatus, string> = {
  pending: "Da consegnare",
  fulfilled: "Consegnato",
  cancelled: "Annullato",
};

export function redemptionStatusLabel(status: string): string {
  return REDEMPTION_STATUS_LABEL[status as RedemptionStatus] ?? status;
}

/**
 * The status control for one redemption — shared by the queue on
 * /admin/loyalty and the customer's own page, which carried two copies of the
 * same select.
 *
 * Annullato is terminal (the points already went back; see
 * `updateRedemptionStatus`), so a cancelled row gets a plain label instead of a
 * select whose every option would fail. A fulfilled one says when it was
 * handed over — the date was stored and never shown.
 */
export function RedemptionStatusForm({ redemption: r }: { redemption: Redemption }) {
  if (r.status === "cancelled") {
    return <p className="text-xs text-brown-800/60">Annullato · punti restituiti al cliente</p>;
  }
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <ActionForm action={updateRedemptionStatus} className="flex items-center gap-2">
        <input type="hidden" name="id" value={r.id} />
        <label className="sr-only" htmlFor={`red-${r.id}`}>
          Stato del riscatto {r.rewardName}
        </label>
        <select id={`red-${r.id}`} name="status" defaultValue={r.status} className={`${inputCls} w-40`}>
          <option value="pending">In attesa</option>
          <option value="fulfilled">Consegnato</option>
          <option value="cancelled">Annullato</option>
        </select>
        <PendingButton tone="dark">Aggiorna</PendingButton>
      </ActionForm>
      {r.status === "fulfilled" && r.fulfilledAt && (
        <p className="text-[11px] text-brown-800/60">Consegnato il {fmtDateTime(r.fulfilledAt)}</p>
      )}
    </div>
  );
}
