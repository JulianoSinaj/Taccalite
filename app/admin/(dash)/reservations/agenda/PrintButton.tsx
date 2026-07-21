"use client";

/** Small print trigger, hidden in the printed output. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-brown-950 px-4 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900 print:hidden"
    >
      Stampa
    </button>
  );
}
