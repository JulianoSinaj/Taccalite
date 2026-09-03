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
  // The other two report pages had no entry, so they fell through to the raw
  // segment and the crumb read "cassa" / "fatture" in lower case.
  cassa: "Chiusura di cassa",
  fatture: "Registro fatture",
  vendite: "Analisi vendite",
  // …and this one is nine letters of plain lower-case, which is exactly what a
  // nanoid looks like to `looksLikeId` below: without an entry the whole page
  // announced itself as "Dettaglio".
  chiusure: "Chiusure",
  users: "Utenti",
  audit: "Registro attività",
  settings: "Impostazioni",
};

/**
 * Sections whose index page an operator may not be allowed to open.
 *
 * `/admin/fulfilment` is admin-only and redirects staff away, but the day sheet
 * under it (`/admin/fulfilment/oggi`) is not — so for a staff account the parent
 * crumb was a link straight back out of the page they had just opened. Rendered
 * as plain text for them instead, the same as a grouping folder.
 */
const ADMIN_ONLY = new Set(["fulfilment", "categories", "discounts", "contenuti", "chiusure", "users", "audit", "settings"]);

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

/**
 * A nanoid-ish path segment is a record id, not a section.
 *
 * The length test alone was not enough: "chiusure" is nine lower-case letters,
 * so the closures page introduced itself as "Dettaglio". Requiring a digit or a
 * capital as well is what actually separates the two populations — ids come from
 * `nanoid`, whose 21 characters are drawn from `A-Za-z0-9_-` (the odds of one
 * containing neither a digit nor a capital are about one in a hundred million),
 * while a route segment in this app is always a lower-case Italian word.
 */
const looksLikeId = (seg: string) =>
  !(seg in LABELS) && seg.length >= 8 && /^[A-Za-z0-9_-]+$/.test(seg) && /[0-9A-Z]/.test(seg);

export function Breadcrumbs({ isAdmin = true }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  // "/admin" alone is the root — a single crumb saying "Dashboard" is noise.
  if (segments.length <= 1) return null;

  const crumbs = segments.map((seg, i) => ({
    href: `/${segments.slice(0, i + 1).join("/")}`,
    label: looksLikeId(seg) ? "Dettaglio" : (LABELS[seg] ?? seg),
    // An id segment isn't a browsable index; neither is a grouping folder, a
    // section this operator would only be redirected out of, nor the last crumb.
    link:
      !looksLikeId(seg) &&
      !NOT_BROWSABLE.has(seg) &&
      (isAdmin || !ADMIN_ONLY.has(seg)) &&
      i < segments.length - 1,
  }));

  return (
    <nav aria-label="Percorso" className="mb-4 print:hidden">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-brown-800/70">
        {crumbs.map((c, i) => (
          <li key={c.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3 shrink-0 opacity-50" aria-hidden />}
            {c.link ? (
              // `.tap`: these are 17px of 12px type, and on a phone they are
              // the whole of "go back up a level" — the sidebar is behind a
              // drawer there. The pseudo-element only grows the axis that is
              // short, so a crumb wider than 44px keeps its own width and the
              // row's spacing is untouched.
              <Link href={c.href} className="tap font-semibold hover:text-brown-950 hover:underline">
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
