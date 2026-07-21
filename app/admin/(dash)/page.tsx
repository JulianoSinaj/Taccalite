import Link from "next/link";
import {
  ShoppingBag,
  CalendarClock,
  ListChecks,
  Gift,
  MailWarning,
  Users,
  Croissant,
  Mail,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { AdminHeader, Panel, StatusBadge, euro } from "@/components/admin/ui";
import {
  getDashboardStats,
  getDashboardInsights,
  getTodayReservations,
  getRecentOrders,
} from "@/lib/admin/queries";
import { smtpConfigured, stripeConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

const typeLabels: Record<string, string> = {
  table: "Tavolo",
  porchetta: "Porchetta",
  order: "Ordine",
};

/** Period-over-period delta as a rounded percentage. */
function delta(cur: number, prev: number): { pct: number; up: boolean } | null {
  if (prev <= 0) return cur > 0 ? { pct: 100, up: true } : null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { pct: Math.abs(pct), up: pct >= 0 };
}

function DeltaBadge({ d }: { d: { pct: number; up: boolean } | null }) {
  if (!d) return null;
  return (
    <span className={`text-xs font-bold ${d.up ? "text-emerald-700" : "text-red-600"}`}>
      {d.up ? "▲" : "▼"} {d.pct}%
    </span>
  );
}

export default async function AdminDashboard() {
  const [s, insights, todayReservations, recentOrders] = await Promise.all([
    getDashboardStats(),
    getDashboardInsights(),
    getTodayReservations(),
    getRecentOrders(6),
  ]);

  const series = insights.dailySeries;
  const maxCents = Math.max(1, ...series.map((d) => d.cents));
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
    {
      label: "Prenotazioni in attesa",
      value: s.pendingReservations,
      href: "/admin/reservations?stato=pending",
      icon: CalendarClock,
    },
    {
      label: "In lista d'attesa",
      value: s.waitlisted,
      href: "/admin/reservations",
      icon: ListChecks,
    },
    {
      label: "Premi da consegnare",
      value: s.pendingRedemptions,
      href: "/admin/loyalty",
      icon: Gift,
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
      <AdminHeader title="Dashboard" subtitle="La tua giornata: incassi, lavoro da fare e attività recente" />

      {/* Money row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {money.map((m, i) => (
          <Panel key={m.label} className={i === 0 ? "border-gold/40 bg-gold/5" : ""}>
            <div className="flex items-center gap-2 text-brown-800/70">
              <TrendingUp className="size-4 text-gold-deep" />
              <p className="text-[11px] font-bold tracking-widest uppercase">{m.label}</p>
            </div>
            <p className="mt-3 font-display text-3xl font-bold text-brown-950">{euro(m.value)}</p>
          </Panel>
        ))}
      </div>

      {/* KPI strip — 30-day performance with period-over-period deltas */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Panel>
          <p className="text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">Incasso 30 giorni</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="font-display text-2xl font-bold text-brown-950">{euro(insights.revenue30dCents)}</p>
            <DeltaBadge d={revDelta} />
          </div>
          <p className="mt-1 text-xs text-brown-800/50">vs. 30 giorni precedenti</p>
        </Panel>
        <Panel>
          <p className="text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">Scontrino medio</p>
          <p className="mt-2 font-display text-2xl font-bold text-brown-950">{euro(insights.aovCents)}</p>
          <p className="mt-1 text-xs text-brown-800/50">{insights.orders30d} ordini pagati (30 gg)</p>
        </Panel>
        <Panel>
          <p className="text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">Ordini 30 giorni</p>
          <p className="mt-2 font-display text-2xl font-bold text-brown-950">{insights.orders30d}</p>
          <p className="mt-1 text-xs text-brown-800/50">pagati</p>
        </Panel>
        <Panel>
          <p className="text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">Nuovi clienti</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="font-display text-2xl font-bold text-brown-950">{insights.newCustomers30d}</p>
            <DeltaBadge d={custDelta} />
          </div>
          <p className="mt-1 text-xs text-brown-800/50">registrati (30 gg)</p>
        </Panel>
      </div>

      {/* Revenue trend + top products */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <h3 className="font-display mb-4 text-lg text-brown-950">Andamento incassi · 30 giorni</h3>
          <div className="flex h-40 items-end gap-1">
            {series.map((d) => (
              <div
                key={d.day}
                className="flex flex-1 flex-col items-center justify-end"
                title={`${d.day}: ${euro(d.cents)}`}
              >
                <div
                  className="w-full rounded-t bg-gold transition-colors hover:bg-gold-dark"
                  style={{ height: `${Math.round((d.cents / maxCents) * 100)}%`, minHeight: d.cents > 0 ? "3px" : "0" }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-brown-800/50">
            <span>{series[0]?.day.slice(5)}</span>
            <span>{series[series.length - 1]?.day.slice(5)}</span>
          </div>
        </Panel>

        <Panel>
          <h3 className="font-display mb-4 text-lg text-brown-950">Prodotti più venduti · 30 gg</h3>
          {insights.topProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-brown-800/60">Nessuna vendita nel periodo.</p>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {queue.map((c) => {
            const Icon = c.icon;
            const active = c.value > 0;
            const danger = c.warn && active;
            const cardCls = danger
              ? "border-red-300 bg-red-50 hover:bg-red-100"
              : active
                ? "border-gold/50 bg-white hover:bg-gold/5 hover:shadow-md"
                : "border-brown-900/10 bg-brown-900/[0.02] hover:bg-white";
            const numCls = danger ? "text-red-700" : active ? "text-brown-950" : "text-brown-800/40";
            const iconCls = danger ? "text-red-600" : "text-gold-deep";
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
            <h3 className="flex items-center gap-2 font-display text-lg text-brown-950">
              <CalendarClock className="size-5 text-gold-deep" />
              Prenotazioni di oggi
            </h3>
            <Link href="/admin/reservations" className="text-xs font-bold tracking-widest text-gold-deep uppercase hover:underline">
              Tutte
            </Link>
          </div>
          {todayReservations.length === 0 ? (
            <p className="py-6 text-center text-sm text-brown-800/60">Nessuna prenotazione per oggi.</p>
          ) : (
            <ul className="divide-y divide-brown-900/10">
              {todayReservations.map((r) => (
                <li key={r.id}>
                  <Link
                    href="/admin/reservations"
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-brown-900/[0.03]"
                  >
                    <span className="w-12 shrink-0 font-display text-sm font-bold text-brown-950">
                      {r.time ?? "—"}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">
                      {typeLabels[r.type] ?? r.type}
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
            <h3 className="flex items-center gap-2 font-display text-lg text-brown-950">
              <ShoppingBag className="size-5 text-gold-deep" />
              Ordini recenti
            </h3>
            <Link href="/admin/orders" className="text-xs font-bold tracking-widest text-gold-deep uppercase hover:underline">
              Tutti
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-brown-800/60">Nessun ordine recente.</p>
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
                    <StatusBadge status={o.status} />
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
                  <Icon className="size-5 text-brown-800/50" />
                  <span className="font-display text-2xl font-bold text-brown-950">{c.value}</span>
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
            <h3 className="font-display text-lg text-brown-950">Stato integrazioni</h3>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-brown-800/80">Invio email (SMTP)</span>
              <span className={smtpConfigured ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                {smtpConfigured ? "Configurato" : "Modalità outbox (test)"}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-brown-800/80">Pagamenti (Stripe)</span>
              <span className={stripeConfigured ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                {stripeConfigured ? "Configurato" : "Modalità simulazione"}
              </span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-brown-800/60">
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
          <h3 className="font-display text-lg text-brown-950">Azioni rapide</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/admin/reservations" className="rounded-full bg-brown-950 px-4 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900">
              Prenotazioni
            </Link>
            <Link href="/admin/products" className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15">
              Nuovo prodotto
            </Link>
            <Link href="/admin/blog" className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15">
              Nuova news
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
