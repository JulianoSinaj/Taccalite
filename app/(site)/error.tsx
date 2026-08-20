"use client";

import Link from "next/link";
import { useEffect } from "react";
import NoticeScreen from "@/components/site/NoticeScreen";

export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Site error:", error);
  }, [error]);

  return (
    <NoticeScreen
      eyebrow="Errore"
      ghost="500"
      title={
        <>
          Qualcosa <span className="wonk text-gold-deep">è andato storto.</span>
        </>
      }
      body="Non siamo riusciti a caricare questa pagina. Riprova fra un momento, oppure torna alla home."
    >
      {/* `reset` is a callback, so this one cannot be the site's <CTA> (a Link).
          Same shape by hand: pill, gold flood, no arrow. */}
      <button
        type="button"
        onClick={reset}
        className="group/cta relative inline-flex items-center justify-center overflow-hidden rounded-full bg-brown-950 px-7 py-3.5 text-[0.9375rem] font-semibold tracking-[-0.01em] whitespace-nowrap text-cream select-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <span
          aria-hidden
          className="absolute inset-0 bg-gold [clip-path:circle(0%_at_50%_120%)] transition-[clip-path] duration-[850ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/cta:[clip-path:circle(150%_at_50%_120%)]"
        />
        <span className="relative z-10 transition-colors duration-500 group-hover/cta:text-brown-950">
          Riprova
        </span>
      </button>

      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-full border border-rule-strong px-7 py-3.5 text-[0.9375rem] font-semibold tracking-[-0.01em] whitespace-nowrap text-brown-950 transition-colors hover:bg-brown-950 hover:text-cream focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Torna alla home
      </Link>
    </NoticeScreen>
  );
}
