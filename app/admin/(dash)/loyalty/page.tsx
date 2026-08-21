import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, inputCls, fmtDate, Pagination } from "@/components/admin/ui";
import { SegmentedFilter, FilterToolbar, ActiveFilters, labelFrom } from "@/components/admin/FilterBar";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getCustomersPage, getRedemptionsPage } from "@/lib/admin/queries";
import { customerFilters, filterQuery } from "@/lib/admin/filters";
import { adjustPoints, updateRedemptionStatus } from "@/lib/admin/actions";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const BASE = "/admin/loyalty";

/** Who counts as "clienti". Staff are excluded by default — see customersWhere. */
const ROLE_CHIPS = [
  { value: "customer", label: "Clienti" },
  { value: "staff", label: "Staff" },
  { value: "admin", label: "Amministratori" },
  { value: "all", label: "Tutti gli account" },
];

const REDEMPTION_CHIPS = [
  { value: "pending", label: "Da consegnare" },
  { value: "fulfilled", label: "Consegnati" },
  { value: "cancelled", label: "Annullati" },
  { value: "all", label: "Tutti" },
];

type SP = {
  searchParams: Promise<{ q?: string; ruolo?: string; page?: string; rpage?: string; rstato?: string }>;
};

export default async function AdminLoyalty({ searchParams }: SP) {
  const sp = await searchParams;
  const { page: pageStr, rpage: rpageStr } = sp;
  const page = Number(pageStr) || 1;
  const rpage = Number(rpageStr) || 1;
  const rstato = sp.rstato ?? "pending";
  const filters = customerFilters(sp);

  // Points adjustment and bulk PII export are admin-only (see the matching
  // server-side guards); hide the controls from staff so they don't 403.
  const [{ rows: customers, total, pageCount }, redemptions, admin] = await Promise.all([
    getCustomersPage({ ...filters, page }),
    getRedemptionsPage({ page: rpage, stato: rstato }),
    isAdmin(),
  ]);

  // Carried by the customer filters so the two paginators don't clobber
  // each other's state.
  const customerParams = { ...filters, rstato, rpage: rpageStr };

  return (
    <div>
      <AdminHeader
        title="Fedeltà"
        subtitle={`${total} ${filters.ruolo === "customer" ? "clienti" : "account"}${
          redemptions.pending > 0 ? ` · ${redemptions.pending} premi da consegnare` : ""
        }`}
        action={
          admin ? (
            <a
              href={`/api/admin/export/customers${filterQuery(filters)}`}
              download
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Esporta CSV
            </a>
          ) : null
        }
      />

      <h2 className="font-display mb-3 text-xl text-brown-950">Clienti e punti</h2>
      {/* The list used to include staff and admins, so its count disagreed with
          the dashboard's and a staff account could have its points adjusted
          from a customer screen. */}
      <SegmentedFilter
        basePath={BASE}
        params={customerParams}
        name="ruolo"
        options={ROLE_CHIPS}
        label="Filtra per tipo di account"
      />
      <FilterToolbar
        basePath={BASE}
        params={customerParams}
        searchPlaceholder="Nome, username, tessera…"
        carry={["ruolo", "rstato"]}
        formId="loyalty-filters"
      />
      <ActiveFilters
        basePath={BASE}
        params={customerParams}
        labels={{
          ruolo: { title: "Account", format: labelFrom(ROLE_CHIPS) },
          q: { title: "Ricerca", format: (v) => `“${v}”` },
        }}
      />

      {customers.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessun account corrisponde a questa vista.</p>
        </Panel>
      ) : (
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
                  @{c.username}
                  {c.email ? ` · ${c.email}` : ""} {c.cardNumber ? `· #${c.cardNumber}` : ""} · iscritto{" "}
                  {fmtDate(c.createdAt)}
                </p>
                <Link
                  href={`/admin/loyalty/${c.id}`}
                  className="mt-1 inline-block text-[11px] font-bold tracking-widest text-gold-dark uppercase hover:underline"
                >
                  Scheda cliente →
                </Link>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="font-display text-2xl font-bold text-brown-950">{c.points ?? 0}</p>
                  <p className="text-[10px] font-bold tracking-widest text-brown-800/60 uppercase">Punti</p>
                </div>
                {admin && (
                  <ActionForm action={adjustPoints} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="userId" value={c.id} />
                    <label className="sr-only" htmlFor={`delta-${c.id}`}>
                      Variazione punti per {c.username}
                    </label>
                    <input
                      id={`delta-${c.id}`}
                      name="delta"
                      type="number"
                      placeholder="±punti"
                      className={`${inputCls} w-24`}
                      required
                    />
                    <label className="sr-only" htmlFor={`reason-${c.id}`}>
                      Motivo
                    </label>
                    <input
                      id={`reason-${c.id}`}
                      name="reason"
                      placeholder="Motivo"
                      className={`${inputCls} w-36`}
                    />
                    <PendingButton tone="dark">Applica</PendingButton>
                  </ActionForm>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={customerParams} />

      <h2 className="font-display mt-10 mb-3 text-xl text-brown-950">Premi riscattati</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        {REDEMPTION_CHIPS.map((chip) => {
          const qs = new URLSearchParams();
          for (const [k, v] of Object.entries({ ...filters, page: pageStr })) {
            if (v && v !== "all") qs.set(k, String(v));
          }
          if (chip.value !== "all") qs.set("rstato", chip.value);
          return (
            <Link
              key={chip.value}
              href={`${BASE}?${qs.toString()}`}
              className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
                rstato === chip.value
                  ? "bg-brown-950 text-cream"
                  : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
              }`}
            >
              {chip.label}
            </Link>
          );
        })}
      </div>

      {redemptions.rows.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            {rstato === "pending" ? "Nessun premio da consegnare." : "Nessun riscatto in questa vista."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {redemptions.rows.map(({ redemption: r, customerName, customerUsername }) => (
            <Panel key={r.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge status={r.status} />
                <div>
                  <p className="font-semibold text-brown-950">{r.rewardName}</p>
                  <p className="text-xs text-brown-800/60">
                    {/* Which customer is the first thing you need to hand a
                        reward over; the list only ever showed the reward. */}
                    <Link href={`/admin/loyalty/${r.userId}`} className="font-semibold hover:underline">
                      {customerName || customerUsername || "cliente"}
                    </Link>{" "}
                    · {r.pointsSpent} punti · {fmtDate(r.createdAt)}
                  </p>
                </div>
              </div>
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
            </Panel>
          ))}
        </div>
      )}

      <Pagination
        basePath={BASE}
        page={rpage}
        pageCount={redemptions.pageCount}
        pageParam="rpage"
        params={{ ...filters, page: pageStr, rstato }}
      />
    </div>
  );
}
