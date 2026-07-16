import Link from "next/link";
import { CalendarCheck, ShoppingBag, Users, Croissant, Gift, Mail } from "lucide-react";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { getDashboardStats } from "@/lib/admin/queries";
import { smtpConfigured, stripeConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const s = await getDashboardStats();

  const cards = [
    { label: "Prenotazioni da gestire", value: s.pendingReservations, href: "/admin/reservations", icon: CalendarCheck },
    { label: "Prenotazioni totali", value: s.totalReservations, href: "/admin/reservations", icon: CalendarCheck },
    { label: "Ordini pagati", value: s.paidOrders, href: "/admin/orders", icon: ShoppingBag },
    { label: "Clienti registrati", value: s.customers, href: "/admin/loyalty", icon: Users },
    { label: "Iscritti newsletter", value: s.subscribers, href: "/admin/newsletter", icon: Croissant },
    { label: "Premi da consegnare", value: s.pendingRedemptions, href: "/admin/loyalty", icon: Gift },
  ];

  return (
    <div>
      <AdminHeader title="Dashboard" subtitle="Panoramica dell'attività" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} href={c.href}>
              <Panel className="transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between">
                  <Icon className="size-6 text-gold-deep" />
                  <span className="font-display text-4xl font-bold text-brown-950">{c.value}</span>
                </div>
                <p className="mt-3 text-sm font-medium text-brown-800/70">{c.label}</p>
              </Panel>
            </Link>
          );
        })}
      </div>

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
