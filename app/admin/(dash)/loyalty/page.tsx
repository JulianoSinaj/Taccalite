import Link from "next/link";
import {
  AdminHeader,
  Panel,
  StatusBadge,
  inputCls,
  labelCls,
  fmtDate,
  roleLabel,
  Pagination,
} from "@/components/admin/ui";
import {
  SegmentedFilter,
  FilterToolbar,
  ActiveFilters,
  filterHref,
  labelFrom,
} from "@/components/admin/FilterBar";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { RedemptionStatusForm, redemptionStatusLabel } from "@/components/admin/RedemptionStatusForm";
import { getCustomersPage, getRedemptionsPage, getLoyaltyOutstanding } from "@/lib/admin/queries";
import { customerFilters, filterQuery } from "@/lib/admin/filters";
import { adjustPoints } from "@/lib/admin/actions";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const BASE = "/admin/loyalty";

// ── Facets ───────────────────────────────────────────────────────────────────

/** Who counts as "clienti". Staff and admins have their own page (Utenti);
 *  "tutti" stays for the rare look at every account that holds a balance. */
const ROLE_CHIPS = [
  { value: "customer", label: "Clienti" },
  { value: "all", label: "Tutti gli account" },
];

const STATE_OPTIONS = [
  { value: "all", label: "Attivi e disattivati" },
  { value: "attivi", label: "Solo attivi" },
  { value: "disattivati", label: "Solo disattivati" },
];

const SORT_OPTIONS = [
  { value: "all", label: "Iscrizione più recente" },
  { value: "punti", label: "Più punti" },
  { value: "nome", label: "Nome A→Z" },
];

const REDEMPTION_CHIPS = [
  { value: "pending", label: "Da consegnare" },
  { value: "fulfilled", label: "Consegnati" },
  { value: "cancelled", label: "Annullati" },
  { value: "all", label: "Tutti" },
];

const btnCls =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15";

type Customer = Awaited<ReturnType<typeof getCustomersPage>>["rows"][number];
type RedemptionRow = Awaited<ReturnType<typeof getRedemptionsPage>>["rows"][number];

type SP = { searchParams: Promise<Record<string, string | undefined>> };

/**
 * Two lists on one page, each with its own filters and pager: the customers
 * (`page`, plus the customer facets) and the redemption queue (`rpage`,
 * `rstato`, `rq`). Every link carries the other list's state, so working one
 * never resets the other.
 */
export default async function AdminLoyalty({ searchParams }: SP) {
  const sp = await searchParams;
  const { page: pageStr, rpage: rpageStr } = sp;
  const page = Number(pageStr) || 1;
  const rpage = Number(rpageStr) || 1;
  const rstato = sp.rstato ?? "pending";
  const rq = sp.rq?.trim() || undefined;
  const filters = customerFilters(sp);

  // Points adjustment and bulk PII export are admin-only (see the matching
  // server-side guards); hide the controls from staff so they don't 403.
  const [{ rows: customers, total, pageCount }, redemptions, outstanding, admin] = await Promise.all([
    getCustomersPage({ ...filters, page }),
    getRedemptionsPage({ page: rpage, stato: rstato, q: rq }),
    getLoyaltyOutstanding(),
    isAdmin(),
  ]);

  const customerParams = { ...filters, rstato, rq, rpage: rpageStr };
  const redemptionParams = { ...filters, page: pageStr, rstato, rq };

  const subtitle = [
    `${total} ${filters.ruolo === "customer" ? "clienti" : "account"}`,
    `${outstanding.toLocaleString("it-IT")} punti in circolazione`,
    redemptions.pending > 0 ? `${redemptions.pending} premi da consegnare` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <AdminHeader
        title="Fedeltà"
        subtitle={subtitle}
        action={
          admin ? (
            <div className="flex flex-wrap gap-2">
              {/* Points are money-equivalent, so the ledger behind the balances
                  deserves the same "take it away and check it" treatment the
                  orders list has. */}
              <a
                href="/api/admin/export/loyalty"
                download
                className={btnCls}
                title="Ogni accredito e addebito di punti, con il motivo"
              >
                Movimenti punti CSV
              </a>
              <a
                href={`/api/admin/export/customers${filterQuery(filters)}`}
                download
                className={btnCls}
                title="I clienti di questa vista, con saldo e tessera"
              >
                Esporta CSV
              </a>
            </div>
          ) : null
        }
      />

      {/* ── Customers ───────────────────────────────────────────────────── */}
      <section aria-labelledby="customers-heading">
        <h2 id="customers-heading" className="font-display mb-3 text-xl text-brown-950">
          Clienti e punti
        </h2>
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
          searchPlaceholder="Nome, email, telefono, tessera…"
          facets={[
            { name: "stato", label: "Stato account", options: STATE_OPTIONS },
            { name: "ordina", label: "Ordina per", options: SORT_OPTIONS },
          ]}
          carry={["ruolo", "rstato", "rq"]}
          formId="loyalty-filters"
        />
        {/* `ruolo` is the segmented control above and always set, so it is
            left out here: "Account: Clienti" is the default view, not a filter. */}
        <ActiveFilters
          basePath={BASE}
          params={customerParams}
          labels={{
            q: { title: "Ricerca", format: (v) => `“${v}”` },
            stato: { title: "Stato", format: labelFrom(STATE_OPTIONS) },
            ordina: { title: "Ordine", format: labelFrom(SORT_OPTIONS) },
          }}
        />

        {customers.length === 0 ? (
          <Panel>
            <p className="text-brown-800/70">Nessun account corrisponde a questa vista.</p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {customers.map((c) => (
              <CustomerRow key={c.id} customer={c} admin={admin} />
            ))}
          </div>
        )}

        <Pagination basePath={BASE} page={page} pageCount={pageCount} params={customerParams} />
      </section>

      {/* ── Redemption queue ────────────────────────────────────────────── */}
      <section aria-labelledby="redemptions-heading" className="mt-12">
        <h2 id="redemptions-heading" className="font-display mb-3 text-xl text-brown-950">
          Premi riscattati
        </h2>
        <SegmentedFilter
          basePath={BASE}
          params={redemptionParams}
          name="rstato"
          options={REDEMPTION_CHIPS}
          label="Filtra i riscatti per stato"
          pageParam="rpage"
        />
        {/* Plain GET form: the shared toolbar owns the `q` name and the
            customer pager, and this queue needs neither. */}
        <form action={BASE} method="get" className="mb-4 flex flex-wrap items-end gap-2">
          {Object.entries({ ...filters, page: pageStr, rstato }).map(([k, v]) =>
            v && v !== "all" ? <input key={k} type="hidden" name={k} value={v} /> : null,
          )}
          <div className="min-w-[14rem] flex-1 sm:flex-none">
            <label className={labelCls} htmlFor="loyalty-rq">
              Cerca nei riscatti
            </label>
            <input
              id="loyalty-rq"
              name="rq"
              defaultValue={rq ?? ""}
              placeholder="Cliente o premio…"
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
          >
            Cerca
          </button>
          {rq && (
            <Link
              href={filterHref(BASE, redemptionParams, { rq: undefined }, "rpage")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold tracking-widest text-brown-800/70 uppercase hover:text-brown-950"
            >
              Azzera ricerca <span aria-hidden>×</span>
            </Link>
          )}
        </form>

        {redemptions.rows.length === 0 ? (
          <Panel>
            <p className="text-brown-800/70">
              {rq
                ? `Nessun riscatto corrisponde a “${rq}”.`
                : rstato === "pending"
                  ? "Nessun premio da consegnare."
                  : "Nessun riscatto in questa vista."}
            </p>
          </Panel>
        ) : (
          <div className="space-y-3">
            {redemptions.rows.map((row) => (
              <RedemptionQueueRow key={row.redemption.id} row={row} />
            ))}
          </div>
        )}

        <Pagination
          basePath={BASE}
          page={rpage}
          pageCount={redemptions.pageCount}
          pageParam="rpage"
          params={redemptionParams}
        />
      </section>
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function CustomerRow({ customer: c, admin }: { customer: Customer; admin: boolean }) {
  return (
    <Panel className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="font-display flex flex-wrap items-center gap-1.5 text-lg text-brown-950">
          {c.name || "—"}
          {c.role !== "customer" && (
            <span className="rounded-full bg-brown-900/10 px-2 py-0.5 text-[11px] font-bold uppercase">
              {roleLabel(c.role)}
            </span>
          )}
          {/* A deactivated account keeps its balance but can't earn or spend;
              the list used to show it like any other. */}
          {!c.active && (
            <span className="rounded-full bg-danger-solid/15 px-2 py-0.5 text-[11px] font-bold text-danger uppercase">
              Disattivato
            </span>
          )}
        </p>
        <p className="text-xs text-brown-800/60">
          @{c.username}
          {c.email ? ` · ${c.email}` : ""}
          {c.phone ? ` · ${c.phone}` : ""}
          {c.cardNumber ? ` · #${c.cardNumber}` : ""} · iscritto {fmtDate(c.createdAt)}
        </p>
        <Link
          href={`/admin/loyalty/${c.id}`}
          className="mt-1 inline-block text-[12px] font-bold tracking-widest text-gold-dark uppercase hover:underline"
        >
          Scheda cliente →
        </Link>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="text-right sm:min-w-16">
          <p className="font-display text-2xl font-bold text-brown-950">{c.points ?? 0}</p>
          <p className="text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">Punti</p>
        </div>
        {admin && c.active && <AdjustPointsForm userId={c.id} username={c.username} />}
        {admin && !c.active && (
          <p className="max-w-40 text-xs text-brown-800/60">
            Account disattivato: le rettifiche si fanno dalla scheda.
          </p>
        )}
      </div>
    </Panel>
  );
}

/**
 * Inline ±points with a mandatory reason — the same fields as the card's form.
 * `inputCls` is `w-full`, so the widths live on wrappers: one compact line
 * on a desktop row instead of two full-width fields stacked under each other.
 */
function AdjustPointsForm({ userId, username }: { userId: string; username: string }) {
  return (
    <ActionForm action={adjustPoints} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="w-28 shrink-0">
        <label className="sr-only" htmlFor={`delta-${userId}`}>
          Variazione punti per {username}
        </label>
        <input
          id={`delta-${userId}`}
          name="delta"
          type="number"
          step="1"
          placeholder="±punti"
          className={inputCls}
          required
        />
      </div>
      <div className="w-full min-w-48 flex-1 sm:w-56 sm:flex-none">
        <label className="sr-only" htmlFor={`reason-${userId}`}>
          Motivo
        </label>
        <input
          id={`reason-${userId}`}
          name="reason"
          placeholder="Motivo (obbligatorio)"
          maxLength={200}
          className={inputCls}
          required
        />
      </div>
      <PendingButton tone="dark">Applica</PendingButton>
    </ActionForm>
  );
}

function RedemptionQueueRow({ row }: { row: RedemptionRow }) {
  const { redemption: r, customerName, customerUsername } = row;
  return (
    <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <StatusBadge status={r.status} label={redemptionStatusLabel(r.status)} />
        <div>
          <p className="font-semibold text-brown-950">{r.rewardName}</p>
          <p className="text-xs text-brown-800/60">
            {/* Which customer is the first thing you need to hand a reward
                over; the list only ever showed the reward. */}
            <Link href={`/admin/loyalty/${r.userId}`} className="font-semibold hover:underline">
              {customerName || customerUsername || "cliente"}
            </Link>{" "}
            · {r.pointsSpent} punti · {fmtDate(r.createdAt)}
          </p>
        </div>
      </div>
      <RedemptionStatusForm redemption={r} />
    </Panel>
  );
}
