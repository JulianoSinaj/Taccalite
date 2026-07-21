export default function AdminLoading() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-brown-950/10" />
      <div className="h-32 animate-pulse rounded-2xl bg-brown-950/10" />
      <div className="h-32 animate-pulse rounded-2xl bg-brown-950/5" />
      <span className="sr-only">Caricamento…</span>
    </div>
  );
}
