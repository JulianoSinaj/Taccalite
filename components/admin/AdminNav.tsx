"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  Croissant,
  Gift,
  LayoutDashboard,
  LogOut,
  Mail,
  Newspaper,
  Package,
  Receipt,
  TicketPercent,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";

const items = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/reservations", label: "Prenotazioni", icon: CalendarCheck },
  { href: "/admin/orders", label: "Ordini", icon: ShoppingBag },
  { href: "/admin/products", label: "Prodotti", icon: Package },
  { href: "/admin/blog", label: "News", icon: Newspaper },
  { href: "/admin/shops", label: "Negozi", icon: Store },
  { href: "/admin/loyalty", label: "Fedeltà", icon: Users, exact: true },
  { href: "/admin/loyalty/scan", label: "Punti in negozio", icon: ScanLine },
  { href: "/admin/rewards", label: "Premi", icon: Gift },
  { href: "/admin/discounts", label: "Codici sconto", icon: TicketPercent, adminOnly: true },
  { href: "/admin/newsletter", label: "Newsletter", icon: Croissant },
  { href: "/admin/outbox", label: "Email", icon: Mail },
  // Admin-only.
  { href: "/admin/analytics", label: "Statistiche", icon: BarChart3, adminOnly: true },
  { href: "/admin/reports/iva", label: "Riepilogo IVA", icon: Receipt, adminOnly: true },
  { href: "/admin/users", label: "Utenti", icon: ShieldCheck, adminOnly: true },
  { href: "/admin/audit", label: "Registro attività", icon: ScrollText, adminOnly: true },
  { href: "/admin/settings", label: "Impostazioni", icon: Settings, adminOnly: true },
];

export default function AdminNav({ userName, isAdmin }: { userName: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const visibleItems = items.filter((item) => !item.adminOnly || isAdmin);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-brown-900/10 bg-white lg:h-screen lg:w-64 lg:border-b-0 lg:border-r print:hidden">
      <div className="border-b border-brown-900/10 px-6 py-5">
        <Link href="/admin" className="block">
          <p className="font-display text-xl font-bold tracking-tighter text-brown-950 uppercase">
            Taccalite
          </p>
          <p className="text-[10px] font-bold tracking-[0.3em] text-gold-deep uppercase">
            Gestionale
          </p>
        </Link>
      </div>
      <nav className="flex flex-1 flex-row gap-1 overflow-x-auto p-3 lg:flex-col lg:overflow-visible">
        {visibleItems.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-brown-950 text-cream"
                  : "text-brown-800/80 hover:bg-brown-900/5 hover:text-brown-950"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-brown-900/10 p-4">
        <p className="mb-2 px-2 text-xs text-brown-800/60">{userName}</p>
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-brown-800/80 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className="size-4" />
          {loggingOut ? "Uscita…" : "Esci"}
        </button>
      </div>
    </aside>
  );
}
