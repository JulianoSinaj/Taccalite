/**
 * The pause between pages.
 *
 * A gold hairline drawing itself across the measure rather than a spinner: the
 * storefront's loading state should look like the progress bar it already has
 * at the top of every page, not like a generic app.
 */
export default function SiteLoading() {
  return (
    <div
      className="flex flex-1 items-center justify-center px-6 py-32"
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-xs flex-col items-center gap-5">
        <span aria-hidden className="relative h-px w-full overflow-hidden bg-rule">
          <span className="absolute inset-y-0 left-0 w-1/3 animate-[loading-sweep_1.4s_ease-in-out_infinite] bg-gold motion-reduce:w-full motion-reduce:animate-none" />
        </span>
        <span className="text-[0.6875rem] font-semibold tracking-[0.28em] text-taupe uppercase">
          Caricamento…
        </span>
      </div>
    </div>
  );
}
