"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Cmd = { label: string; href: string; group: string; adminOnly?: boolean; keywords?: string };

const COMMANDS: Cmd[] = [
  // Vai a…
  { label: "Dashboard", href: "/admin", group: "Vai a" },
  { label: "Prenotazioni", href: "/admin/reservations", group: "Vai a", keywords: "booking caparra" },
  { label: "Ordini", href: "/admin/orders", group: "Vai a" },
  { label: "Prodotti", href: "/admin/products", group: "Vai a", keywords: "catalogo giacenza" },
  { label: "News / Blog", href: "/admin/blog", group: "Vai a" },
  { label: "Negozi", href: "/admin/shops", group: "Vai a" },
  { label: "Fedeltà", href: "/admin/loyalty", group: "Vai a", keywords: "punti clienti" },
  { label: "Punti in negozio", href: "/admin/loyalty/scan", group: "Vai a" },
  { label: "Premi", href: "/admin/rewards", group: "Vai a" },
  { label: "Codici sconto", href: "/admin/discounts", group: "Vai a", adminOnly: true, keywords: "coupon" },
  { label: "Newsletter", href: "/admin/newsletter", group: "Vai a" },
  { label: "Email / Outbox", href: "/admin/outbox", group: "Vai a" },
  { label: "Sicurezza (2FA)", href: "/admin/security", group: "Vai a" },
  { label: "Statistiche", href: "/admin/analytics", group: "Vai a", adminOnly: true },
  { label: "Riepilogo IVA", href: "/admin/reports/iva", group: "Vai a", adminOnly: true, keywords: "fiscale fattura" },
  { label: "Utenti", href: "/admin/users", group: "Vai a", adminOnly: true },
  { label: "Registro attività", href: "/admin/audit", group: "Vai a", adminOnly: true },
  { label: "Impostazioni", href: "/admin/settings", group: "Vai a", adminOnly: true },
  // Azioni
  { label: "Nuovo ordine (banco/telefono)", href: "/admin/orders/new", group: "Azioni", keywords: "vendita manuale" },
  { label: "Nuovo prodotto", href: "/admin/products", group: "Azioni" },
  { label: "Nuova news", href: "/admin/blog", group: "Azioni" },
  { label: "Nuovo codice sconto", href: "/admin/discounts", group: "Azioni", adminOnly: true },
];

export default function CommandPalette({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const available = useMemo(() => COMMANDS.filter((c) => !c.adminOnly || isAdmin), [isAdmin]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((c) => `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase().includes(q));
  }, [query, available]);

  // Global ⌘K / Ctrl+K toggle.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus the input and reset state when opening.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Focus after paint.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-brown-950/40 px-4 pt-[12vh] print:hidden"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Comandi rapidi"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-brown-900/10 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              go(results[active].href);
            }
          }}
          placeholder="Cerca una sezione o un'azione…"
          className="w-full border-b border-brown-900/10 px-5 py-4 text-sm text-brown-950 placeholder:text-brown-800/40 focus:outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <li className="px-5 py-6 text-center text-sm text-brown-800/50">Nessun risultato.</li>
          ) : (
            results.map((c, i) => (
              <li key={`${c.href}-${c.label}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(c.href)}
                  className={`flex w-full items-center justify-between px-5 py-2.5 text-left text-sm ${
                    i === active ? "bg-gold/15 text-brown-950" : "text-brown-800/80 hover:bg-brown-900/[0.03]"
                  }`}
                >
                  <span>{c.label}</span>
                  <span className="text-[10px] font-bold tracking-widest text-brown-800/40 uppercase">{c.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-brown-900/10 px-5 py-2 text-[11px] text-brown-800/50">
          ↑↓ per navigare · ↵ per aprire · Esc per chiudere
        </div>
      </div>
    </div>
  );
}
