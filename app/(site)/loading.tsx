export default function SiteLoading() {
  return (
    <div
      className="flex flex-1 items-center justify-center bg-cream px-6 py-32"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-brown-950/20 border-t-gold"
          aria-hidden="true"
        />
        <span className="text-xs font-bold tracking-widest text-brown-800/60 uppercase">
          Caricamento…
        </span>
      </div>
    </div>
  );
}
