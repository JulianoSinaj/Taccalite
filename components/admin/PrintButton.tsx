"use client";

/** Small print trigger, hidden in the printed output. */
export function PrintButton({ children = "Stampa" }: { children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-4 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900 print:hidden"
    >
      {children}
    </button>
  );
}
