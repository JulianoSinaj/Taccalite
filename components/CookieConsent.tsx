"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "taccalite-cookie-consent";

type Consent = "accepted" | "essential";

/**
 * Minimal GDPR cookie banner. The site currently sets only strictly-necessary
 * cookies (session), so "essential only" is the privacy-preserving default. The
 * stored choice gates any future analytics/marketing scripts.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      /* private mode — show banner, choice just won't persist */
      setVisible(true);
    }
  }, []);

  function choose(value: Consent) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
      window.dispatchEvent(new CustomEvent("taccalite:consent", { detail: value }));
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Preferenze cookie"
      className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-3xl rounded-2xl border border-brown-900/15 bg-cream/95 p-5 shadow-[0_20px_50px_-15px_rgba(42,26,16,0.4)] backdrop-blur-xl sm:inset-x-6 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-brown-900/85">
          Usiamo solo cookie tecnici necessari al funzionamento del sito. Consulta la{" "}
          <Link href="/cookie" className="font-semibold text-gold-deep underline">
            cookie policy
          </Link>{" "}
          e la{" "}
          <Link href="/privacy" className="font-semibold text-gold-deep underline">
            privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => choose("essential")}
            className="rounded-full border border-brown-900/20 px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase transition-colors hover:bg-brown-900/5"
          >
            Solo necessari
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase transition-colors hover:bg-gold-dark"
          >
            Accetta
          </button>
        </div>
      </div>
    </div>
  );
}
