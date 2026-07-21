import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader, Panel, StatusBadge, inputCls, labelCls, euro, fmtDate } from "@/components/admin/ui";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { adminGetUser, getLoyaltyAccountForUser, getRecentLoyaltyTx } from "@/lib/admin/queries";
import { getReservationsForUser, getRedemptionsForUser } from "@/lib/db/queries";
import { getOrdersForUser } from "@/lib/orders";
import { adjustPoints } from "@/lib/admin/actions";
import { anonymizeCustomer } from "@/lib/admin/user-actions";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  customer: "Cliente",
  staff: "Staff",
  admin: "Amministratore",
};

const RES_TYPE_LABEL: Record<string, string> = {
  table: "Tavolo",
  porchetta: "Porchetta",
  order: "Ordine",
};

/** Human-friendly summary of a reservation's date/time or kg quantity. */
function reservationDetail(r: {
  type: string;
  date: string;
  time: string | null;
  guests: number | null;
  quantityKg: number | null;
}): string {
  const parts: string[] = [fmtDate(r.date)];
  if (r.time) parts.push(r.time);
  if (r.type === "porchetta" && r.quantityKg != null) parts.push(`${r.quantityKg} kg`);
  else if (r.guests != null) parts.push(`${r.guests} pers.`);
  return parts.join(" · ");
}

type Params = { params: Promise<{ id: string }> };

export default async function CustomerDetail({ params }: Params) {
  const { id } = await params;

  const user = await adminGetUser(id);
  if (!user) notFound();

  const [loyalty, tx, orders, reservations, redemptions, admin] = await Promise.all([
    getLoyaltyAccountForUser(id),
    getRecentLoyaltyTx(id),
    getOrdersForUser(id),
    getReservationsForUser(id),
    getRedemptionsForUser(id),
    isAdmin(),
  ]);

  const displayName = user.name || user.username;

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/loyalty" className="text-xs font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
          ← Torna a Fedeltà
        </Link>
      </div>

      <AdminHeader title={displayName} subtitle="Scheda cliente" />

      {/* Header card: identity + loyalty summary */}
      <Panel className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-display text-2xl text-brown-950">
            {displayName}{" "}
            <span className="ml-1 rounded-full bg-brown-900/10 px-2 py-0.5 text-[10px] font-bold uppercase">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          </p>
          <p className="mt-1 text-sm text-brown-800/70">
            @{user.username}
            {user.email ? ` · ${user.email}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-brown-800/60">Iscritto il {fmtDate(user.createdAt)}</p>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="font-display text-3xl font-bold text-brown-950">{loyalty?.points ?? 0}</p>
            <p className="text-[10px] font-bold tracking-widest text-brown-800/60 uppercase">Punti</p>
          </div>
          <div className="text-right">
            <p className="font-display text-lg text-brown-950">{loyalty?.cardNumber ? `#${loyalty.cardNumber}` : "—"}</p>
            <p className="text-[10px] font-bold tracking-widest text-brown-800/60 uppercase">Tessera</p>
          </div>
        </div>
      </Panel>

      {/* Points adjustment — admin only */}
      {admin && (
        <>
          <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Rettifica punti</h2>
          <Panel>
            <ActionForm action={adjustPoints} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="userId" value={user.id} />
              <div>
                <label className={labelCls} htmlFor="delta">
                  Variazione
                </label>
                <input
                  id="delta"
                  name="delta"
                  type="number"
                  placeholder="±punti"
                  className={`${inputCls} w-32`}
                  required
                />
              </div>
              <div className="flex-1 min-w-48">
                <label className={labelCls} htmlFor="reason">
                  Motivo
                </label>
                <input id="reason" name="reason" placeholder="Es. Rettifica manuale" className={inputCls} />
              </div>
              <PendingButton tone="dark">Applica</PendingButton>
            </ActionForm>
            <p className="mt-3 text-xs text-brown-800/60">
              Usa un valore positivo per accreditare (es. <strong>+50</strong> per un bonus), negativo per
              scalare (es. <strong>−20</strong> per una correzione). Il motivo resta nello storico.
            </p>
          </Panel>
        </>
      )}

      {/* GDPR tools — admin only */}
      {admin && user.role !== "admin" && (
        <>
          <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Privacy (GDPR)</h2>
          <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-brown-950">Diritti dell&apos;interessato</p>
              <p className="mt-1 text-xs text-brown-800/60">
                Esporta tutti i dati del cliente (art. 15) o anonimizza l&apos;account e le
                prenotazioni (art. 17). Gli ordini restano per obblighi fiscali.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/admin/gdpr/${user.id}`}
                download
                className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
              >
                Esporta dati
              </a>
              <DeleteForm
                action={anonymizeCustomer}
                id={user.id}
                confirm={`Anonimizzare definitivamente i dati di ${displayName}? L'operazione non è reversibile. Gli ordini restano per obblighi fiscali.`}
              >
                Anonimizza
              </DeleteForm>
            </div>
          </Panel>
        </>
      )}

      {/* Points ledger */}
      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Storico punti</h2>
      {tx.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun movimento punti.</p>
        </Panel>
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brown-900/10 text-left text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">
                <th className="px-5 py-3">Data</th>
                <th className="px-5 py-3">Motivo</th>
                <th className="px-5 py-3 text-right">Variazione</th>
                <th className="px-5 py-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {tx.map((t) => (
                <tr key={t.id} className="border-b border-brown-900/5 last:border-0">
                  <td className="px-5 py-3 whitespace-nowrap text-brown-800/70">{fmtDate(t.createdAt)}</td>
                  <td className="px-5 py-3 text-brown-950">{t.reason || "—"}</td>
                  <td
                    className={`px-5 py-3 text-right font-bold tabular-nums ${
                      t.delta >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {t.delta >= 0 ? `+${t.delta}` : t.delta}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-brown-950">{t.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Orders */}
      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Ordini</h2>
      {orders.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun ordine.</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Panel key={o.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge status={o.status} />
                <div>
                  <Link href={`/admin/orders/${o.id}`} className="font-semibold text-brown-950 hover:underline">
                    {o.orderNumber}
                  </Link>
                  <p className="text-xs text-brown-800/60">{fmtDate(o.createdAt)}</p>
                </div>
              </div>
              <p className="font-display text-lg text-brown-950">{euro(o.totalCents)}</p>
            </Panel>
          ))}
        </div>
      )}

      {/* Reservations */}
      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Prenotazioni</h2>
      {reservations.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessuna prenotazione.</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {reservations.map((r) => (
            <Panel key={r.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge status={r.status} />
                <div>
                  <p className="font-semibold text-brown-950">
                    {RES_TYPE_LABEL[r.type] ?? r.type}{" "}
                    <span className="text-xs font-normal text-brown-800/50">#{r.reference}</span>
                  </p>
                  <p className="text-xs text-brown-800/60">{reservationDetail(r)}</p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* Redemptions */}
      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Premi riscattati</h2>
      {redemptions.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun premio riscattato.</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {redemptions.map((r) => (
            <Panel key={r.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge status={r.status} />
                <div>
                  <p className="font-semibold text-brown-950">{r.rewardName}</p>
                  <p className="text-xs text-brown-800/60">
                    {r.pointsSpent} punti · {fmtDate(r.createdAt)}
                  </p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
