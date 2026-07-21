"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin error:", error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-brown-950/10 bg-white/60 p-8 text-center">
      <h1 className="font-display text-2xl text-brown-950">Errore nel gestionale</h1>
      <p className="mt-2 text-sm text-brown-900/70">
        Si è verificato un errore caricando questa sezione. Riprova.
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-brown-950 px-6 py-2.5 text-[11px] font-bold tracking-widest text-cream uppercase transition-colors hover:bg-brown-900"
      >
        Riprova
      </button>
    </div>
  );
}
