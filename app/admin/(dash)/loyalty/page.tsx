import { AdminHeader, Panel, StatusBadge, inputCls, fmtDate, SearchBox, Pagination } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getCustomersPage, getRedemptions } from "@/lib/admin/queries";
import { adjustPoints, updateRedemptionStatus } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

type SP = { searchParams: Promise<{ q?: string; page?: string }> };

export default async function AdminLoyalty({ searchParams }: SP) {
  const { q, page: pageStr } = await searchParams;
  const page = Number(pageStr) || 1;
  const [{ rows: customers, total, pageCount }, redemptions] = await Promise.all([
    getCustomersPage({ q, page }),
    getRedemptions(),
  ]);

  return (
    <div>
      <AdminHeader
        title="Fedeltà"
        subtitle={`${total} clienti`}
        action={
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- API download route, not a page
          <a
            href="/api/admin/export/customers"
            download
            className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Esporta CSV
          </a>
        }
      />

      <h2 className="font-display mb-3 text-xl text-brown-950">Clienti e punti</h2>
      <SearchBox basePath="/admin/loyalty" q={q} placeholder="Cerca per nome, username, tessera…" />
      <div className="space-y-3">
        {customers.map((c) => (
          <Panel key={c.id} className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-display text-lg text-brown-950">
                {c.name || "—"}{" "}
                {c.role !== "customer" && (
                  <span className="ml-1 rounded-full bg-brown-900/10 px-2 py-0.5 text-[10px] font-bold uppercase">
                    {c.role}
                  </span>
                )}
              </p>
              <p className="text-xs text-brown-800/60">
                @{c.username}{c.email ? ` · ${c.email}` : ""} {c.cardNumber ? `· #${c.cardNumber}` : ""} · iscritto {fmtDate(c.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="font-display text-2xl font-bold text-brown-950">{c.points ?? 0}</p>
                <p className="text-[10px] font-bold tracking-widest text-brown-800/60 uppercase">Punti</p>
              </div>
              <ActionForm action={adjustPoints} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="userId" value={c.id} />
                <input name="delta" type="number" placeholder="±punti" className={`${inputCls} w-24`} required />
                <input name="reason" placeholder="Motivo" className={`${inputCls} w-36`} />
                <PendingButton tone="dark">Applica</PendingButton>
              </ActionForm>
            </div>
          </Panel>
        ))}
      </div>

      <Pagination basePath="/admin/loyalty" page={page} pageCount={pageCount} params={{ q }} />

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
              <ActionForm action={updateRedemptionStatus} className="flex items-center gap-2">
                <input type="hidden" name="id" value={r.id} />
                <select name="status" defaultValue={r.status} className={`${inputCls} w-40`}>
                  <option value="pending">In attesa</option>
                  <option value="fulfilled">Consegnato</option>
                  <option value="cancelled">Annullato</option>
                </select>
                <PendingButton tone="dark">Aggiorna</PendingButton>
              </ActionForm>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
