"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

/**
 * Where you are, and one click back to where you came from.
 *
 * Detail pages carried an ad-hoc "← Torna a …" on some screens and nothing on
 * others, so a nested page like /admin/products/scadenze had no way back except
 * the browser. Derived from the path so every route gets one for free.
 *
 * Ids are not labelled here — the page's own header already names the record,
 * and fetching a name per crumb would mean a query on every render.
 */

const LABELS: Record<string, string> = {
  admin: "Dashboard",
  orders: "Ordini",
  new: "Nuovo",
  "packing-slip": "Documento di consegna",
  reservations: "Prenotazioni",
  agenda: "Agenda",
  calendar: "Calendario",
  products: "Prodotti",
  categories: "Categorie",
  // The nav calls the config page "Zone e fasce" and the day sheet under it
  // "Ritiri e consegne"; the crumbs say the same so the two never swap names.
  fulfilment: "Zone e fasce",
  contenuti: "Testi del sito",
  oggi: "Ritiri e consegne di oggi",
  scadenze: "Scadenze",
  blog: "News",
  shops: "Negozi",
  loyalty: "Fedeltà",
  scan: "Punti in negozio",
  rewards: "Premi",
  discounts: "Codici sconto",
  newsletter: "Newsletter",
  outbox: "Email",
  security: "Sicurezza",
  analytics: "Statistiche",
  reports: "Report",
  iva: "Riepilogo IVA",
  users: "Utenti",
  audit: "Registro attività",
  settings: "Impostazioni",
};

/**
 * Segments that name a section but have no page of their own.
 *
 * `LABELS` answers "what is this segment called", which is not the same question
 * as "can I open it". `/admin/reports/iva` needs a "Report" crumb, but there is
 * no `app/admin/(dash)/reports/page.tsx` — so linking it gave all three report
 * pages a crumb that 404s, plus a prefetch of that 404 on every visit. Add a
 * segment here when it is a grouping folder rather than a route.
 */
const NOT_BROWSABLE = new Set(["reports"]);

/** A nanoid-ish path segment is a record id, not a section. */
const looksLikeId = (seg: string) => !(seg in LABELS) && /^[A-Za-z0-9_-]{8,}$/.test(seg);

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  // "/admin" alone is the root — a single crumb saying "Dashboard" is noise.
  if (segments.length <= 1) return null;

  const crumbs = segments.map((seg, i) => ({
    href: `/${segments.slice(0, i + 1).join("/")}`,
    label: looksLikeId(seg) ? "Dettaglio" : (LABELS[seg] ?? seg),
    // An id segment isn't a browsable index; neither is a grouping folder, nor
    // the last crumb.
    link: !looksLikeId(seg) && !NOT_BROWSABLE.has(seg) && i < segments.length - 1,
  }));

  return (
    <nav aria-label="Percorso" className="mb-4 print:hidden">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-brown-800/60">
        {crumbs.map((c, i) => (
          <li key={c.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3 shrink-0 opacity-50" aria-hidden />}
            {c.link ? (
              <Link href={c.href} className="font-semibold hover:text-brown-950 hover:underline">
                {c.label}
              </Link>
            ) : (
              <span className={i === crumbs.length - 1 ? "text-brown-800" : undefined}>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
