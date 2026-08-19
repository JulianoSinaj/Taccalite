"use client";

import { useEffect, useState } from "react";
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
  Menu,
  Newspaper,
  Package,
  Receipt,
  TicketPercent,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,
  ShieldHalf,
  ShoppingBag,
  Store,
  Users,
  X,
} from "lucide-react";

/**
 * Admin navigation.
 *
 * Eighteen destinations were one flat list — and on mobile, one horizontal
 * scroll strip of all eighteen, where finding "Impostazioni" meant swiping past
 * everything else. They're grouped by what an operator is doing (selling,
 * looking after customers, publishing, running the place), and mobile gets a
 * real drawer instead of a strip.
 */

type Item = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; adminOnly?: boolean };
type Group = { title: string | null; items: Item[] };

const GROUPS: Group[] = [
  { title: null, items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
  {
    title: "Vendite",
    items: [
      { href: "/admin/orders", label: "Ordini", icon: ShoppingBag },
      { href: "/admin/reservations", label: "Prenotazioni", icon: CalendarCheck },
      { href: "/admin/products", label: "Prodotti", icon: Package },
      { href: "/admin/discounts", label: "Codici sconto", icon: TicketPercent, adminOnly: true },
    ],
  },
  {
    title: "Clienti",
    items: [
      { href: "/admin/loyalty", label: "Fedeltà", icon: Users, exact: true },
      { href: "/admin/loyalty/scan", label: "Punti in negozio", icon: ScanLine },
      { href: "/admin/rewards", label: "Premi", icon: Gift },
      { href: "/admin/newsletter", label: "Newsletter", icon: Croissant },
    ],
  },
  {
    title: "Contenuti",
    items: [
      { href: "/admin/blog", label: "News", icon: Newspaper },
      { href: "/admin/shops", label: "Negozi", icon: Store },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/admin/reports/iva", label: "Riepilogo IVA", icon: Receipt, adminOnly: true },
      { href: "/admin/analytics", label: "Statistiche", icon: BarChart3, adminOnly: true },
      { href: "/admin/outbox", label: "Email", icon: Mail },
      { href: "/admin/audit", label: "Registro attività", icon: ScrollText, adminOnly: true },
      { href: "/admin/users", label: "Utenti", icon: ShieldCheck, adminOnly: true },
      { href: "/admin/security", label: "Sicurezza", icon: ShieldHalf },
      { href: "/admin/settings", label: "Impostazioni", icon: Settings, adminOnly: true },
    ],
  },
];

export default function AdminNav({
  userName,
  isAdmin,
  themeToggle,
}: {
  userName: string;
  isAdmin: boolean;
  /** Rendered in the footer. Passed in because it is a server component (it
   *  holds a server action) and this file is a client one. */
  themeToggle?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [open, setOpen] = useState(false);

  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.adminOnly || isAdmin),
  })).filter((g) => g.items.length > 0);

  // The drawer is a navigation overlay: it must not survive the navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (item: Item) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

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

  const nav = (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
      {groups.map((group, gi) => (
        <div key={group.title ?? `g${gi}`}>
          {group.title && (
            <p className="px-4 pb-1.5 text-[10px] font-bold tracking-[0.2em] text-brown-800/45 uppercase">
              {group.title}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
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
          </div>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-brown-900/10 p-4">
      {themeToggle && <div className="mb-3">{themeToggle}</div>}
      <p className="mb-2 px-2 text-xs text-brown-800/60">{userName}</p>
      <button
        type="button"
        onClick={logout}
        disabled={loggingOut}
        className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-brown-800/80 transition-colors hover:bg-danger-soft hover:text-danger-soft-fg disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOut className="size-4" />
        {loggingOut ? "Uscita…" : "Esci"}
      </button>
    </div>
  );

  const brand = (
    <Link href="/admin" className="block">
      <p className="font-display text-xl font-bold tracking-tighter text-brown-950 uppercase">Taccalite</p>
      <p className="text-[10px] font-bold tracking-[0.3em] text-gold-deep uppercase">Gestionale</p>
    </Link>
  );

  return (
    <>
      {/* Mobile: a bar with a drawer trigger, instead of a scroll strip. */}
      <div className="flex items-center justify-between border-b border-brown-900/10 bg-surface px-5 py-3 lg:hidden print:hidden">
        {brand}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Apri il menu"
          aria-expanded={open}
          className="rounded-xl p-2 text-brown-800 hover:bg-brown-900/5"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <button
            type="button"
            aria-label="Chiudi il menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-brown-950/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-brown-900/10 px-5 py-4">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Chiudi il menu"
                className="rounded-xl p-2 text-brown-800 hover:bg-brown-900/5"
              >
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {footer}
          </div>
        </div>
      )}

      {/* Desktop: the persistent sidebar. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-brown-900/10 bg-surface lg:flex lg:h-screen print:hidden">
        <div className="border-b border-brown-900/10 px-6 py-5">{brand}</div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
