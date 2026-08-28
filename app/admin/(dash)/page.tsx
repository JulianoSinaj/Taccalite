import Link from "next/link";
import {
  ShoppingBag,
  Truck,
  CalendarClock,
  ListChecks,
  Gift,
  MailWarning,
  PackageSearch,
  Users,
  Croissant,
  Mail,
  TrendingUp,
  ArrowRight,
  CalendarX,
} from "lucide-react";
import { AdminHeader, Panel, OrderStatusBadge, StatusBadge, euro, reservationTypeLabel } from "@/components/admin/ui";
import {
  getDashboardStats,
  getDashboardInsights,
  getTodayReservations,
  getRecentOrders,
  adminGetNextClosure,
} from "@/lib/admin/queries";
import { isAdmin } from "@/lib/auth/session";
import { closureRangeLabel, closureStatus, closureTimeLabel } from "@/lib/closures";
import { dateInRome } from "@/lib/time";
import { smtpAuthConfigured, smtpConfigured, stripeConfigured } from "@/lib/env";
import { simulatedPayments } from "@/lib/payments/config";
import { shopScope } from "@/lib/admin/scope";
import { adminGetShops } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

/** Period-over-period delta as a rounded percentage. */
function delta(cur: number, prev: number): { pct: number; up: boolean } | null {
  if (prev <= 0) return cur > 0 ? { pct: 100, up: true } : null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { pct: Math.abs(pct), up: pct >= 0 };
}

function DeltaBadge({ d }: { d: { pct: number; up: boolean } | null }) {
  if (!d) return null;
  return (
    <span className={`text-xs font-bold ${d.up ? "text-ok" : "text-danger"}`}>
      {d.up ? "▲" : "▼"} {d.pct}%
    </span>
  );
}

/**
 * Integration status for the summary card. Derived from the env flags only —
 * unlike `/admin/settings` this card must not open an SMTP connection, because
 * it renders on the one page every operator loads all day.
 *
 * Both rows are three-state, and the middle state is the one that matters. A
 * two-state green/amber read as "configured" on exactly the configurations that
 * lose every message and every card sale, which is worse than saying nothing:
 * this is the card an operator checks to decide whether mail works.
 */
// Whole class names, not `text-${tone}` — Tailwind only emits what it can find
// as a literal in the source, so an interpolated tone silently renders unstyled.
const OK = "font-semibold text-ok";
const WARN = "font-semibold text-warn";
const DANGER = "font-semibold text-danger";

type IntegrationStatus = { label: string; cls: string };

// Host set with blank credentials is the *loud* failure, not a lesser one: the
// relay rejects each message with `502 Please authenticate first` and it is
// retired after OUTBOX_MAX_ATTEMPTS, where a missing host merely leaves it
// queued. Hence danger here and warn below. Mirrors the banner in the layout.
const MAIL_STATUS: IntegrationStatus = smtpAuthConfigured
  ? { label: "Configurato", cls: OK }
  : smtpConfigured
    ? { label: "Credenziali mancanti", cls: DANGER }
    : { label: "Modalità outbox (test)", cls: WARN };

// `simulatedPayments` is gated on NODE_ENV=development, so "modalità
// simulazione" is only true in dev. Without keys in production nothing is
// simulated — the card option is withdrawn from the checkout entirely, and
// saying "simulazione" there described a mode that was not running.
const PAYMENTS_STATUS: IntegrationStatus = stripeConfigured
  ? { label: "Configurato", cls: OK }
  : simulatedPayments
    ? { label: "Modalità simulazione", cls: WARN }
    : { label: "Non configurato — carta non disponibile", cls: DANGER };

function IntegrationRow({ name, status }: { name: string; status: IntegrationStatus }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-brown-800/80">{name}</span>
      <span className={`text-right ${status.cls}`}>{status.label}</span>
    </li>
  );
}

export default async function AdminDashboard() {
  // "La tua giornata" was everybody's: every figure on this page was computed
  // across the whole business, so an operator confined to one location opened it
  // to the other shop's takings, bookings and recent orders. The lists already
  // enforced the boundary; the summary of those same lists did not.
  const scope = await shopScope();
  const today = dateInRome();
  const [s, insights, todayReservations, recentOrders, shops, nextClosure, admin] = await Promise.all([
    getDashboardStats(scope),
    getDashboardInsights(scope),
    getTodayReservations(scope),
    getRecentOrders(6, scope),
    adminGetShops(),
    adminGetNextClosure(scope, 14, today),
    isAdmin(),
  ]);
  const scopedShopName = scope ? (shops.find((sh) => sh.slug === scope)?.name ?? scope) : null;
  const closureShop = nextClosure?.shopSlug
    ? (shops.find((sh) => sh.slug === nextClosure.shopSlug)?.name ?? nextClosure.shopSlug)
    : "tutte le sedi";

  const series = insights.dailySeries;
  const maxCents = Math.max(1, ...series.map((d) => d.cents));
  const hasRevenue = series.some((d) => d.cents > 0);
  // A bar chart of pure CSS divs is invisible to a screen reader; the label
  // gives the same information as prose.
  const best = series.reduce((a, b) => (b.cents > a.cents ? b : a), series[0] ?? { day: "", cents: 0 });
  const chartLabel = `Incassi giornalieri dal ${series[0]?.day ?? ""} al ${
    series[series.length - 1]?.day ?? ""
  }. Totale ${euro(insights.revenue30dCents)}. Giornata migliore ${best.day} con ${euro(best.cents)}.`;
  const maxTopCents = Math.max(1, ...insights.topProducts.map((p) => p.cents));

  const revDelta = delta(insights.revenue30dCents, insights.revenuePrev30dCents);
  const custDelta = delta(insights.newCustomers30d, insights.newCustomersPrev30d);

  const money = [
    { label: "Incasso oggi", value: s.revenueTodayCents },
    { label: "Ultimi 7 giorni", value: s.revenue7dCents },
    { label: "Ultimi 30 giorni", value: s.revenue30dCents },
  ];

  // Actionable work queue. `warn` items turn amber/red when the count is > 0.
  const queue = [
    {
      label: "Ordini da evadere",
      value: s.ordersToFulfil,
      href: "/admin/orders?stato=to-fulfil",
      icon: ShoppingBag,
    },
    // The day sheet's own number: who is coming to the counter today. It was
    // reachable only by opening the sheet, on the one morning screen that is
    // meant to say what the day holds.
    {
      label: "Ritiri di oggi",
      value: s.pickupsToday,
      href: "/admin/fulfilment/oggi",
      icon: Truck,
    },
    {
      label: "Prenotazioni in attesa",
      value: s.pendingReservations,
      href: "/admin/reservations?stato=pending",
      icon: CalendarClock,
    },
    {
      label: "In lista d'attesa",
      value: s.waitlisted,
      href: "/admin/reservations?stato=waitlist",
      icon: ListChecks,
    },
    {
      label: "Premi da consegnare",
      value: s.pendingRedemptions,
      href: "/admin/loyalty",
      icon: Gift,
    },
    // Inventory belongs in the morning list as much as the bookings do: both of
    // these were computed somewhere already (the catalogue's low-stock facet,
    // the expiry report's count) and reachable only by remembering to go and
    // look at the page that shows them.
    {
      label: "Scorte basse",
      value: s.lowStock,
      href: "/admin/products?scorte=basse&stato=attivi",
      icon: PackageSearch,
      warn: true as const,
    },
    {
      label: "Lotti in scadenza",
      value: s.expiringSoon,
      href: "/admin/products/scadenze",
      icon: CalendarClock,
      warn: true as const,
    },
    {
      label: "Email fallite",
      value: s.failedEmails,
      href: "/admin/outbox?stato=failed",
      icon: MailWarning,
      warn: true as const,
    },
  ];

  const overview = [
    { label: "Ordini pagati", value: s.paidOrders, href: "/admin/orders", icon: ShoppingBag },
    { label: "Prenotazioni totali", value: s.totalReservations, href: "/admin/reservations", icon: CalendarClock },
    { label: "Clienti registrati", value: s.customers, href: "/admin/loyalty", icon: Users },
    { label: "Iscritti newsletter", value: s.subscribers, href: "/admin/newsletter", icon: Croissant },
  ];

  return (
    <div>
      <AdminHeader
        title="Dashboard"
        subtitle={
          scopedShopName
            ? `${scopedShopName}: incassi, lavoro da fare e attività recente`
            : "La tua giornata: incassi, lavoro da fare e attività recente"
        }
      />

      {/* A shutdown nobody remembers is the one that catches the counter out.
          Only what is under way or inside the fortnight — a closure in six
          months is the closures page's business, not the morning's. */}
      {nextClosure && (
        <Panel className="mb-4 border-warn/40 bg-warn-soft">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-warn-soft-fg">
            <CalendarX className="size-4 shrink-0" aria-hidden />
            <span>
              {closureStatus(nextClosure, today) === "ongoing" ? "Chiusura in corso" : "Prossima chiusura"}:{" "}
              <strong>{closureRangeLabel(nextClosure)}</strong>
              {closureTimeLabel(nextClosure) ? ` ${closureTimeLabel(nextClosure)}` : ""} · {closureShop}
              {nextClosure.reason ? ` · ${nextClosure.reason}` : ""}
            </span>
            {admin && (
              <Link href="/admin/chiusure" className="font-bold underline">
                Gestisci →
              </Link>
            )}
          </p>
        </Panel>
      )}

      {/* Money row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {money.map((m, i) => (
          <Panel key={m.label} className={i === 0 ? "border-gold/40 bg-gold/5" : ""}>
            <div className="flex items-center gap-2 text-brown-800/70">
              <TrendingUp className="size-4 text-gold-deep" />
              <p className="text-[12px] font-bold tracking-widest uppercase">{m.label}</p>
            </div>
            <p className="mt-3 font-display text-3xl font-bold text-brown-950">{euro(m.value)}</p>
          </Panel>
        ))}
      </div>

      {/* KPI strip — 30-day performance with period-over-period deltas */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Panel>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">Incasso 30 giorni</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <p className="font-display text-xl font-bold tabular-nums text-brown-950 sm:text-2xl">{euro(insights.revenue30dCents)}</p>
            <DeltaBadge d={revDelta} />
          </div>
          <p className="mt-1 text-xs text-brown-800/70">vs. 30 giorni precedenti</p>
        </Panel>
        <Panel>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">Scontrino medio</p>
          <p className="mt-2 font-display text-xl font-bold tabular-nums text-brown-950 sm:text-2xl">{euro(insights.aovCents)}</p>
          <p className="mt-1 text-xs text-brown-800/70">{insights.orders30d} ordini pagati (30 gg)</p>
        </Panel>
        <Panel>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">Ordini 30 giorni</p>
          <p className="mt-2 font-display text-xl font-bold tabular-nums text-brown-950 sm:text-2xl">{insights.orders30d}</p>
          <p className="mt-1 text-xs text-brown-800/70">pagati</p>
        </Panel>
        <Panel>
          <p className="text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">Nuovi clienti</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <p className="font-display text-xl font-bold tabular-nums text-brown-950 sm:text-2xl">{insights.newCustomers30d}</p>
            <DeltaBadge d={custDelta} />
          </div>
          <p className="mt-1 text-xs text-brown-800/70">registrati (30 gg)</p>
        </Panel>
      </div>

      {/* Revenue trend + top products */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h2 className="font-display mb-4 text-lg text-brown-950">Andamento incassi · 30 giorni</h2>
          {hasRevenue ? (
            <>
              {/* No `items-end` on the row: that sizes each column to its own
                  content, and a column's content is a bar asking for a
                  percentage *of that column* — circular, so it resolved to auto
                  and every bar fell back to its 3px `minHeight`. The chart drew
                  a flat row of dashes while carrying perfectly correct
                  percentages. Stretching the columns gives the percentage a
                  definite height to resolve against; `justify-end` inside each
                  column is what actually sits the bar on the baseline. */}
              <div className="flex h-40 gap-1" role="img" aria-label={chartLabel}>
                {series.map((d) => (
                  <div
                    key={d.day}
                    className="flex h-full flex-1 flex-col items-center justify-end"
                    title={`${d.day}: ${euro(d.cents)}`}
                  >
                    <div
                      className="w-full rounded-t bg-gold transition-colors hover:bg-gold-dark"
                      style={{
                        height: `${Math.round((d.cents / maxCents) * 100)}%`,
                        minHeight: d.cents > 0 ? "3px" : "0",
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-brown-800/70">
                <span>{series[0]?.day.slice(5)}</span>
                <span>{series[series.length - 1]?.day.slice(5)}</span>
              </div>
            </>
          ) : (
            // Zero everywhere used to render an invisible row of bars, which
            // reads as a broken panel rather than as "no sales yet".
            <p className="grid h-40 place-items-center rounded-lg bg-cream/60 text-sm text-brown-800/70">
              Nessun incasso registrato negli ultimi 30 giorni.
            </p>
          )}
        </Panel>

        <Panel>
          <h2 className="font-display mb-4 text-lg text-brown-950">Prodotti più venduti · 30 gg</h2>
          {insights.topProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-brown-800/70">Nessuna vendita nel periodo.</p>
          ) : (
            <ul className="space-y-3">
              {insights.topProducts.map((p) => (
                <li key={p.name}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-brown-950">{p.name}</span>
                    <span className="shrink-0 font-semibold text-brown-950">{euro(p.cents)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brown-900/10">
                    <div className="h-full rounded-full bg-gold-deep" style={{ width: `${Math.round((p.cents / maxTopCents) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Work queue — the actionable part */}
      <div className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg text-brown-950">
          <ListChecks className="size-5 text-gold-deep" />
          Da fare
        </h2>
        {/* Seven tiles now the two inventory ones are here, so the row wraps at
            four rather than five — five would leave two orphans on a wide
            screen. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {queue.map((c) => {
            const Icon = c.icon;
            const active = c.value > 0;
            const danger = c.warn && active;
            const cardCls = danger
              ? "border-danger/40 bg-danger-soft hover:bg-danger-soft"
              : active
                ? "border-gold/50 bg-surface hover:bg-gold/5 hover:shadow-md"
                : "border-brown-900/10 bg-brown-900/[0.02] hover:bg-surface";
            const numCls = danger ? "text-danger-soft-fg" : active ? "text-brown-950" : "text-brown-800/70";
            const iconCls = danger ? "text-danger" : "text-gold-deep";
            return (
              <Link
                key={c.label}
                href={c.href}
                className={`group flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition-colors ${cardCls}`}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`size-5 ${iconCls}`} />
                  <span className={`font-display text-3xl font-bold ${numCls}`}>{c.value}</span>
                </div>
                <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-brown-800/80">
                  {c.label}
                  <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Today's reservations + recent orders */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg text-brown-950">
              <CalendarClock className="size-5 text-gold-deep" />
              Prenotazioni di oggi
            </h2>
            <Link href="/admin/reservations" className="text-xs font-bold tracking-widest text-gold-deep uppercase hover:underline">
              Tutte
            </Link>
          </div>
          {todayReservations.length === 0 ? (
            <p className="py-6 text-center text-sm text-brown-800/70">Nessuna prenotazione per oggi.</p>
          ) : (
            <ul className="divide-y divide-brown-900/10">
              {todayReservations.map((r) => (
                <li key={r.id}>
                  {/* The booking itself, not the list it lives in: every other
                      surface (calendar, agenda, customer 360) links straight to
                      the detail page, and "Tutte" above already covers the list. */}
                  <Link
                    href={`/admin/reservations/${r.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-brown-900/[0.03]"
                  >
                    <span className="w-12 shrink-0 font-display text-sm font-bold text-brown-950">
                      {r.time ?? "—"}
                    </span>
                    <span className="shrink-0 text-[12px] font-bold tracking-widest text-brown-800/70 uppercase">
                      {reservationTypeLabel(r.type)}
                    </span>
                    <span className="flex-1 truncate text-sm text-brown-950">{r.name}</span>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg text-brown-950">
              <ShoppingBag className="size-5 text-gold-deep" />
              Ordini recenti
            </h2>
            <Link href="/admin/orders" className="text-xs font-bold tracking-widest text-gold-deep uppercase hover:underline">
              Tutti
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-brown-800/70">Nessun ordine recente.</p>
          ) : (
            <ul className="divide-y divide-brown-900/10">
              {recentOrders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-brown-900/[0.03]"
                  >
                    <span className="shrink-0 font-mono text-xs font-bold text-brown-800/70">#{o.orderNumber}</span>
                    <span className="flex-1 truncate text-sm text-brown-950">{o.name}</span>
                    <span className="shrink-0 text-sm font-semibold text-brown-950">{euro(o.totalCents)}</span>
                    <OrderStatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Vanity overview */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {overview.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href}>
              <Panel className="transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between">
                  <Icon className="size-5 text-brown-800/70" />
                  <span className="font-display text-xl font-bold tabular-nums text-brown-950 sm:text-2xl">{c.value}</span>
                </div>
                <p className="mt-2 text-xs font-medium text-brown-800/70">{c.label}</p>
              </Panel>
            </Link>
          );
        })}
      </div>

      {/* Integrations + quick actions */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Panel>
          <div className="flex items-center gap-3">
            <Mail className="size-5 text-gold-deep" />
            <h2 className="font-display text-lg text-brown-950">Stato integrazioni</h2>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <IntegrationRow name="Invio email (SMTP)" status={MAIL_STATUS} />
            <IntegrationRow name="Pagamenti (Stripe)" status={PAYMENTS_STATUS} />
          </ul>
          <p className="mt-4 text-xs text-brown-800/70">
            Le email non inviate restano leggibili in{" "}
            <Link href="/admin/outbox" className="font-semibold text-gold-deep underline">
              Email
            </Link>
            . Configura SMTP e Stripe da{" "}
            <Link href="/admin/settings" className="font-semibold text-gold-deep underline">
              Impostazioni
            </Link>
            .
          </p>
        </Panel>

        <Panel>
          <h2 className="font-display text-lg text-brown-950">Azioni rapide</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/admin/reservations/new" className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-4 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900">
              Nuova prenotazione
            </Link>
            <Link href="/admin/orders/new" className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-4 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900">
              Nuovo ordine
            </Link>
            <Link href="/admin/products/new" className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15">
              Nuovo prodotto
            </Link>
            <Link href="/admin/blog/new" className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15">
              Nuova news
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
