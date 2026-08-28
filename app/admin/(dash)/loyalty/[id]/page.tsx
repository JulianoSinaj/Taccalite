import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AdminHeader,
  HistoryLink,
  Panel,
  OrderStatusBadge,
  StatusBadge,
  inputCls,
  labelCls,
  euro,
  fmtDate,
  roleLabel,
  reservationTypeLabel,
} from "@/components/admin/ui";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import {
  adminGetUser,
  getLoyaltyAccountForUser,
  getLoyaltyTxForUser,
  getCustomerStats,
} from "@/lib/admin/queries";
import { getReservationsForUser, getRedemptionsForUser } from "@/lib/db/queries";
import { getOrdersForUser } from "@/lib/orders";
import { RedemptionStatusForm, redemptionStatusLabel } from "@/components/admin/RedemptionStatusForm";
import { adjustPoints } from "@/lib/admin/actions";
import { anonymizeCustomer, updateUserProfile } from "@/lib/admin/user-actions";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

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

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ movimenti?: string }>;
};

export default async function CustomerDetail({ params, searchParams }: Params) {
  const [{ id }, { movimenti }] = await Promise.all([params, searchParams]);
  const allTx = movimenti === "tutti";

  const user = await adminGetUser(id);
  if (!user) notFound();

  const [loyalty, ledger, orders, reservations, redemptions, stats, admin] = await Promise.all([
    getLoyaltyAccountForUser(id),
    getLoyaltyTxForUser(id, { all: allTx }),
    getOrdersForUser(id),
    getReservationsForUser(id),
    getRedemptionsForUser(id),
    getCustomerStats(id),
    isAdmin(),
  ]);

  const displayName = user.name || user.username;

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/loyalty" className="text-xs font-bold tracking-widest text-brown-800/70 uppercase hover:text-brown-950">
          ← Torna a Fedeltà
        </Link>
      </div>

      <AdminHeader
        title={displayName}
        subtitle="Scheda cliente"
        action={admin ? <HistoryLink id={user.id} /> : undefined}
      />

      {/* Header card: identity + loyalty summary */}
      <Panel className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-display text-2xl text-brown-950">
            {displayName}{" "}
            <span className="ml-1 rounded-full bg-brown-900/10 px-2 py-0.5 text-[11px] font-bold uppercase">
              {roleLabel(user.role)}
            </span>
          </p>
          <p className="mt-1 text-sm text-brown-800/70">
            @{user.username}
            {user.email ? ` · ${user.email}` : ""}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-brown-800/70">
            Iscritto il {fmtDate(user.createdAt)}
            {!user.active && (
              <span className="rounded-full bg-danger-solid/15 px-2 py-0.5 text-[11px] font-bold text-danger uppercase">
                Disattivato
              </span>
            )}
            {user.email && !user.emailVerifiedAt && (
              <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-bold text-warn-soft-fg uppercase">
                Email da verificare
              </span>
            )}
            {user.totpEnabled && (
              <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-bold text-ok uppercase">
                2FA
              </span>
            )}
            {user.marketingConsent && (
              <span className="rounded-full bg-brown-900/10 px-2 py-0.5 text-[11px] font-bold uppercase">
                Consenso marketing
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="font-display text-3xl font-bold text-brown-950">{loyalty?.points ?? 0}</p>
            <p className="text-[11px] font-bold tracking-widest text-brown-800/70 uppercase">Punti</p>
          </div>
          <div className="text-right">
            <p className="font-display text-lg text-brown-950">{loyalty?.cardNumber ? `#${loyalty.cardNumber}` : "—"}</p>
            <p className="text-[11px] font-bold tracking-widest text-brown-800/70 uppercase">Tessera</p>
          </div>
        </div>
      </Panel>

      {/* What the customer has actually been worth. The page listed orders but
          never totalled them, so "is this a good customer?" meant adding rows
          up by eye. Refunds are netted out. */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Panel>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">Speso finora</p>
          <p className="font-display mt-1 text-2xl font-bold text-brown-950">{euro(stats.spentCents)}</p>
          <p className="mt-0.5 text-xs text-brown-800/70">al netto dei rimborsi</p>
        </Panel>
        <Panel>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">Ordini</p>
          <p className="font-display mt-1 text-2xl font-bold text-brown-950">{stats.orders}</p>
        </Panel>
        <Panel>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">Scontrino medio</p>
          <p className="font-display mt-1 text-2xl font-bold text-brown-950">{euro(stats.aovCents)}</p>
        </Panel>
        <Panel>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">Ultimo ordine</p>
          <p className="font-display mt-1 text-xl text-brown-950">
            {stats.lastOrderAt ? fmtDate(stats.lastOrderAt) : "—"}
          </p>
        </Panel>
      </div>

      {/* Contact details — admin only */}
      {admin && (
        <>
          <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Anagrafica</h2>
          <Panel>
            <ActionForm action={updateUserProfile} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={user.id} />
              <div className="min-w-48 flex-1">
                <label className={labelCls} htmlFor="profile-name">Nome</label>
                <input id="profile-name" name="name" required maxLength={200} defaultValue={user.name ?? ""} className={inputCls} />
              </div>
              <div className="min-w-48 flex-1">
                <label className={labelCls} htmlFor="profile-email">Email</label>
                <input id="profile-email" name="email" type="email" maxLength={200} defaultValue={user.email ?? ""} className={inputCls} />
              </div>
              <div className="min-w-40">
                <label className={labelCls} htmlFor="profile-phone">Telefono</label>
                <input id="profile-phone" name="phone" maxLength={40} defaultValue={user.phone ?? ""} className={inputCls} />
              </div>
              <label htmlFor="profile-marketing" className="flex min-h-11 items-center gap-2 text-sm text-brown-950">
                <input
                  id="profile-marketing"
                  type="checkbox"
                  name="marketingConsent"
                  defaultChecked={user.marketingConsent}
                  className="h-4 w-4 accent-gold-dark"
                />
                Consenso marketing
              </label>
              <PendingButton tone="dark">Salva</PendingButton>
            </ActionForm>
            <p className="mt-3 text-xs text-brown-800/70">
              Username e ruolo si modificano da <strong>Utenti</strong>. Cambiando l&apos;email,
              l&apos;indirizzo torna &laquo;da verificare&raquo;.
            </p>
          </Panel>
        </>
      )}

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
                  step="1"
                  placeholder="±punti"
                  className={`${inputCls} w-32`}
                  required
                />
              </div>
              <div className="flex-1 min-w-48">
                <label className={labelCls} htmlFor="reason">
                  Motivo
                </label>
                <input
                  id="reason"
                  name="reason"
                  placeholder="Es. Bonus compleanno, correzione scontrino"
                  maxLength={200}
                  className={inputCls}
                  required
                />
              </div>
              <PendingButton tone="dark">Applica</PendingButton>
            </ActionForm>
            <p className="mt-3 text-xs text-brown-800/70">
              Usa un valore positivo per accreditare (es. <strong>+50</strong> per un bonus), negativo per
              scalare (es. <strong>−20</strong> per una correzione). Il motivo è obbligatorio: resta
              nello storico del cliente e nel registro attività.
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
              <p className="mt-1 text-xs text-brown-800/70">
                Esporta tutti i dati del cliente (art. 15) o anonimizza l&apos;account e le
                prenotazioni (art. 17). Gli ordini restano per obblighi fiscali.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/admin/gdpr/${user.id}`}
                download
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
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
      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">
        Storico punti{ledger.total > 0 ? ` (${ledger.total})` : ""}
      </h2>
      {ledger.rows.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun movimento punti.</p>
        </Panel>
      ) : (
        <Panel className="scroll-x p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brown-900/10 text-left text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
                <th scope="col" className="px-5 py-3">Data</th>
                <th scope="col" className="px-5 py-3">Motivo</th>
                <th scope="col" className="px-5 py-3 text-right">Variazione</th>
                <th scope="col" className="px-5 py-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((t) => (
                <tr key={t.id} className="border-b border-brown-900/5 last:border-0">
                  <td className="px-5 py-3 whitespace-nowrap text-brown-800/70">{fmtDate(t.createdAt)}</td>
                  <td className="px-5 py-3 text-brown-950">{t.reason || "—"}</td>
                  <td
                    className={`px-5 py-3 text-right font-bold tabular-nums ${
                      t.delta >= 0 ? "text-ok" : "text-danger"
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
      {!allTx && ledger.total > ledger.rows.length && (
        <p className="mt-3 text-sm">
          <Link
            href={`/admin/loyalty/${user.id}?movimenti=tutti`}
            className="text-[12px] font-bold tracking-widest text-gold-dark uppercase hover:underline"
          >
            Mostra tutti i {ledger.total} movimenti →
          </Link>
        </p>
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
                <OrderStatusBadge status={o.status} />
                <div>
                  <Link href={`/admin/orders/${o.id}`} className="font-semibold text-brown-950 hover:underline">
                    {o.orderNumber}
                  </Link>
                  <p className="text-xs text-brown-800/70">{fmtDate(o.createdAt)}</p>
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
                  <Link
                    href={`/admin/reservations/${r.id}`}
                    className="font-semibold text-brown-950 hover:underline"
                  >
                    {reservationTypeLabel(r.type)}{" "}
                    <span className="text-xs font-normal text-brown-800/70">#{r.reference}</span>
                  </Link>
                  <p className="text-xs text-brown-800/70">{reservationDetail(r)}</p>
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
                <StatusBadge status={r.status} label={redemptionStatusLabel(r.status)} />
                <div>
                  <p className="font-semibold text-brown-950">{r.rewardName}</p>
                  <p className="text-xs text-brown-800/70">
                    {r.pointsSpent} punti · {fmtDate(r.createdAt)}
                  </p>
                </div>
              </div>
              {/* Handing the reward over is the whole point of opening a
                  customer's page, and it used to mean going back to the global
                  list on /admin/loyalty and finding the row again. */}
              <RedemptionStatusForm redemption={r} />
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
