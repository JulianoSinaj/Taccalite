"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Cmd = { label: string; href: string; group: string; adminOnly?: boolean; keywords?: string };

const COMMANDS: Cmd[] = [
  // Vai a…
  { label: "Dashboard", href: "/admin", group: "Vai a" },
  { label: "Prenotazioni", href: "/admin/reservations", group: "Vai a", keywords: "booking caparra" },
  { label: "Agenda / prep del giorno", href: "/admin/reservations/agenda", group: "Vai a", keywords: "prenotazioni giornata stampa foglio" },
  { label: "Calendario prenotazioni", href: "/admin/reservations/calendar", group: "Vai a", keywords: "settimana prenotazioni" },
  { label: "Ordini", href: "/admin/orders", group: "Vai a" },
  { label: "Ritiri e consegne di oggi", href: "/admin/fulfilment/oggi", group: "Vai a", keywords: "asporto consegna spedizione fasce oggi" },
  { label: "Zone e fasce", href: "/admin/fulfilment", group: "Vai a", adminOnly: true, keywords: "cap tariffe spedizione consegna ritiro slot orari" },
  { label: "Chiusure", href: "/admin/chiusure", group: "Vai a", adminOnly: true, keywords: "ferie festivi chiuso vacanze ferragosto natale" },
  { label: "Prodotti", href: "/admin/products", group: "Vai a", keywords: "catalogo giacenza" },
  { label: "Scadenze lotti", href: "/admin/products/scadenze", group: "Vai a", keywords: "lotti haccp scaduti magazzino" },
  { label: "Categorie", href: "/admin/categories", group: "Vai a", adminOnly: true, keywords: "categoria tassonomia reparto" },
  { label: "News / Blog", href: "/admin/blog", group: "Vai a" },
  { label: "Negozi", href: "/admin/shops", group: "Vai a" },
  { label: "Testi del sito", href: "/admin/contenuti", group: "Vai a", adminOnly: true, keywords: "contenuti copy privacy cookie storia" },
  { label: "Fedeltà", href: "/admin/loyalty", group: "Vai a", keywords: "punti clienti" },
  { label: "Punti in negozio", href: "/admin/loyalty/scan", group: "Vai a" },
  { label: "Premi", href: "/admin/rewards", group: "Vai a" },
  { label: "Codici sconto", href: "/admin/discounts", group: "Vai a", adminOnly: true, keywords: "coupon" },
  { label: "Newsletter", href: "/admin/newsletter", group: "Vai a" },
  { label: "Email / Outbox", href: "/admin/outbox", group: "Vai a" },
  { label: "Sicurezza (2FA)", href: "/admin/security", group: "Vai a" },
  { label: "Statistiche", href: "/admin/analytics", group: "Vai a", adminOnly: true },
  { label: "Chiusura di cassa", href: "/admin/reports/cassa", group: "Vai a", keywords: "contanti pos incasso quadratura fondo cassa giornata" },
  { label: "Riepilogo IVA", href: "/admin/reports/iva", group: "Vai a", adminOnly: true, keywords: "fiscale fattura" },
  { label: "Registro fatture", href: "/admin/reports/fatture", group: "Vai a", adminOnly: true, keywords: "fatturazione elettronica sdi xml nota di credito" },
  { label: "Utenti", href: "/admin/users", group: "Vai a", adminOnly: true },
  { label: "Registro attività", href: "/admin/audit", group: "Vai a", adminOnly: true },
  { label: "Impostazioni", href: "/admin/settings", group: "Vai a", adminOnly: true },
  // Azioni
  { label: "Nuova prenotazione (banco/telefono)", href: "/admin/reservations/new", group: "Azioni", keywords: "booking tavolo porchetta" },
  { label: "Nuovo ordine (banco/telefono)", href: "/admin/orders/new", group: "Azioni", keywords: "vendita manuale" },
  { label: "Nuovo prodotto", href: "/admin/products/new", group: "Azioni", keywords: "catalogo" },
  { label: "Nuova categoria", href: "/admin/categories/new", group: "Azioni", adminOnly: true, keywords: "reparto" },
  { label: "Nuova news", href: "/admin/blog/new", group: "Azioni" },
  { label: "Nuovo premio", href: "/admin/rewards/new", group: "Azioni", keywords: "fedeltà" },
  { label: "Nuova sede", href: "/admin/shops/new", group: "Azioni", adminOnly: true, keywords: "negozio" },
  { label: "Nuovo codice sconto", href: "/admin/discounts/new", group: "Azioni", adminOnly: true, keywords: "coupon" },
  { label: "Nuovo utente", href: "/admin/users/new", group: "Azioni", adminOnly: true, keywords: "account staff" },
];

/** A record found by `/api/admin/search`, as opposed to a static destination. */
type Hit = {
  kind: "order" | "reservation" | "customer" | "product" | "discount";
  id: string;
  href: string;
  title: string;
  subtitle: string;
};

const HIT_GROUP: Record<Hit["kind"], string> = {
  order: "Ordine",
  reservation: "Prenotazione",
  customer: "Cliente",
  product: "Prodotto",
  discount: "Codice sconto",
};

/**
 * How anything else on the page asks for the palette.
 *
 * ⌘K used to be the *only* way in, which meant the search over every order,
 * customer, product and discount code was unreachable on the tablet at the
 * counter — a phone has no ⌘K — and invisible on desktop to anyone who had not
 * been told about it. `AdminNav` now draws a trigger in both layouts and calls
 * this; an event rather than lifted state, because the nav and the palette are
 * siblings under the layout and neither owns the other.
 */
const OPEN_EVENT = "admin:open-search";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * The palette shell: nothing but the open flag and the shortcut that flips it.
 *
 * The body is a separate component mounted only while open, so its query,
 * cursor and results are reset by unmounting rather than by an effect that
 * cleared them on every open — the cascading render the compiler warns about,
 * and one that also blanked the input a frame *after* it appeared.
 */
export default function CommandPalette({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);

  // Global ⌘K / Ctrl+K toggle. Lives out here so the shortcut works whether or
  // not the palette is currently mounted.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  if (!open) return null;
  return <Palette isAdmin={isAdmin} onClose={() => setOpen(false)} />;
}

function Palette({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * The last completed lookup, tagged with the term it answered.
   *
   * Stored together so "are we still waiting" is derived rather than a second
   * piece of state — which also keeps every `setState` inside the async
   * callback, where the React Compiler wants it, instead of running
   * synchronously in the effect body on every keystroke.
   */
  const [result, setResult] = useState<{ q: string; hits: Hit[] }>({ q: "", hits: [] });

  const trimmed = query.trim();
  const wantsSearch = trimmed.length >= 2;
  // Results for a slightly older prefix stay on screen while the next request
  // is in flight: the alternative is the list blanking on every keystroke.
  // Memoised so the empty case is a stable reference — otherwise it is a fresh
  // array each render and every downstream `useMemo` recomputes.
  const hits = useMemo(() => (wantsSearch ? result.hits : []), [wantsSearch, result.hits]);
  const searching = wantsSearch && result.q !== trimmed;

  const available = useMemo(() => COMMANDS.filter((c) => !c.adminOnly || isAdmin), [isAdmin]);
  const commandResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((c) => `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase().includes(q));
  }, [query, available]);

  /**
   * Records first, destinations after.
   *
   * The palette used to be a list of forty links and nothing else: it could
   * take you to the orders *page* but never to an order — the opposite of what
   * someone typing a customer's name with the phone against their ear wants.
   * Hits lead because when they exist they are almost always the answer.
   */
  const results = useMemo(
    () => [
      ...hits.map((h) => ({
        label: h.title,
        href: h.href,
        group: HIT_GROUP[h.kind],
        detail: h.subtitle,
      })),
      ...commandResults.map((c) => ({ label: c.label, href: c.href, group: c.group, detail: "" })),
    ],
    [hits, commandResults],
  );

  /**
   * Debounced record lookup. 200 ms is long enough that typing a name is one
   * request rather than eight, short enough not to feel like waiting.
   *
   * The abort controller is what stops a slow early response landing after a
   * fast later one and repopulating the list with results for a prefix the
   * operator has already typed past.
   */
  useEffect(() => {
    if (!wantsSearch) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`, {
          signal: ctrl.signal,
        });
        const json = await res.json();
        setResult({ q: trimmed, hits: res.ok && json.ok ? (json.hits as Hit[]) : [] });
      } catch {
        // An aborted request is the normal case here, not a failure worth
        // showing: the static commands are still listed either way.
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmed, wantsSearch]);

  // Focus after paint. Pure DOM synchronisation — the state it used to reset
  // alongside this now starts fresh because the component is newly mounted.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [router, onClose],
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-brown-950/40 px-4 pt-[8dvh] print:hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Comandi rapidi"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-brown-900/10 bg-surface shadow-2xl"
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
          placeholder="Cerca un ordine, un cliente, un prodotto o una sezione…"
          className="w-full border-b border-brown-900/10 px-5 py-4 text-sm text-brown-950 placeholder:text-brown-800/70 focus:outline-none"
        />
        <ul className="max-h-[min(20rem,50dvh)] overflow-y-auto py-2">
          {results.length === 0 ? (
            <li className="px-5 py-6 text-center text-sm text-brown-800/70">
              {searching ? "Ricerca…" : "Nessun risultato."}
            </li>
          ) : (
            results.map((c, i) => (
              <li key={`${c.href}-${c.label}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(c.href)}
                  className={`flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-sm ${
                    i === active ? "bg-gold/15 text-brown-950" : "text-brown-800/80 hover:bg-brown-900/[0.03]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{c.label}</span>
                    {/* The subtitle is what makes two customers with the same
                        surname distinguishable without opening either. */}
                    {c.detail && (
                      <span className="block truncate text-xs text-brown-800/70">{c.detail}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] font-bold tracking-widest text-brown-800/70 uppercase">
                    {c.group}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-brown-900/10 px-5 py-2 text-[12px] text-brown-800/70">
          ↑↓ per navigare · ↵ per aprire · Esc per chiudere
        </div>
      </div>
    </div>
  );
}
