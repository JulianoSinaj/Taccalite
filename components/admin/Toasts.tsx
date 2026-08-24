"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ActionState } from "@/lib/admin/action-state";

/**
 * Transient feedback for admin actions.
 *
 * Action results used to render as a `<p>` *inside* the submitting form. On the
 * big edit forms that was fine; on the dozens of one-button forms in list rows it
 * was not — "Articolo nascosto." appeared between the Pubblica and Modifica
 * buttons, shoving the row apart, and stayed there until the next page load.
 *
 * A toast fixes all three: it lives outside the document flow so no layout can be
 * disturbed, it always appears in the same place so it is findable, and it
 * expires on its own. Errors linger roughly twice as long as successes and are
 * announced assertively, since they usually require the operator to do something.
 *
 * Three rules keep the stack from becoming the problem it was meant to solve —
 * an operator toggling ★ down a product list at speed used to bury the very rows
 * being toggled under five identical confirmations:
 *
 *  - repeats collapse. A result identical to one already on screen bumps that
 *    toast's counter and restarts its timer instead of adding a row, so ten
 *    clicks read "Prodotto messo in evidenza. ×10" on one line.
 *  - the stack is capped at MAX_VISIBLE. Past that the oldest is evicted, so the
 *    column can never grow past a known height however fast the clicking goes.
 *  - only the dismiss button takes pointer events. The card itself is inert, so
 *    a toast drifting over a row's buttons is something you can click *through*
 *    rather than an obstacle to wait out.
 */

type Toast = {
  id: number;
  status: "success" | "error";
  message: string;
  /** How many identical results have collapsed into this one. */
  count: number;
};

const SUCCESS_MS = 4000;
const ERROR_MS = 9000;
const MAX_VISIBLE = 3;

const ToastContext = createContext<(state: ActionState) => void>(() => {});

/** Publish an ActionState as a toast. Idle/empty results are ignored. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  // The rendered list is mirrored in a ref so a burst of results landing in the
  // same tick each sees what the previous one did. A `setToasts(prev => …)`
  // updater could not do the timer bookkeeping below without running it twice
  // under StrictMode's double-invocation.
  const listRef = useRef<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const commit = useCallback((next: Toast[]) => {
    listRef.current = next;
    setToasts(next);
  }, []);

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      commit(listRef.current.filter((t) => t.id !== id));
    },
    [clearTimer, commit],
  );

  /** (Re)starts a toast's expiry. Called again on every collapsed repeat, so the
   *  counter stays on screen for the full window after the *last* click. */
  const arm = useCallback(
    (id: number, status: Toast["status"]) => {
      clearTimer(id);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), status === "error" ? ERROR_MS : SUCCESS_MS),
      );
    },
    [clearTimer, dismiss],
  );

  const push = useCallback(
    (state: ActionState) => {
      if (state.status === "idle" || !state.message) return;
      const status = state.status;
      const message = state.message;
      const current = listRef.current;

      const existing = current.find((t) => t.status === status && t.message === message);
      if (existing) {
        arm(existing.id, status);
        // Counted in place rather than moved to the bottom: a toast that jumped
        // position on every repeat was harder to read than the count it carried.
        commit(
          current.map((t) => (t.id === existing.id ? { ...t, count: t.count + 1 } : t)),
        );
        return;
      }

      const id = (nextId.current += 1);
      arm(id, status);
      const next = [...current, { id, status, message, count: 1 }];
      // Evict from the top, and drop the evicted toasts' timers with them.
      for (const stale of next.slice(0, Math.max(0, next.length - MAX_VISIBLE))) {
        clearTimer(stale.id);
      }
      commit(next.slice(-MAX_VISIBLE));
    },
    [arm, clearTimer, commit],
  );

  // Navigating away mid-countdown would otherwise leave timers firing into a
  // provider that no longer exists.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* `fixed` keeps this out of every form's layout. The wrapper ignores
          pointer events so it can never swallow a click meant for the page
          underneath; each toast re-enables them for its own dismiss button. */}
      {/* z-70 puts this above the nav drawer (40) and the command palette (60):
          all three used to be z-50, so which one won was decided by DOM order.
          `pb-safe` on the outer wrapper — it *sets* padding-bottom, so it cannot
          share an element with the `p-4` that gives the stack its inset. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] pb-safe">
        <div
          className="flex flex-col items-center gap-2 p-4 sm:items-end"
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.status === "error" ? "alert" : "status"}
              // Inert card, live close button: the operator keeps clicking the
              // rows underneath while the confirmation is still fading.
              className={`pointer-events-none flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
                t.status === "error"
                  ? "border-danger/30 bg-danger-soft text-danger-soft-fg"
                  : "border-ok/40 bg-ok-soft text-ok-soft-fg"
              }`}
            >
              <span aria-hidden className="mt-px font-bold">
                {t.status === "error" ? "!" : "✓"}
              </span>
              <p className="flex-1 font-medium">{t.message}</p>
              {t.count > 1 && (
                <span className="mt-px rounded-full bg-current/15 px-2 py-0.5 text-xs font-bold tabular-nums">
                  {/* Spelled out for the live region: an `aria-label` on a bare
                      span is not reliably announced, and "×3" read literally is
                      "multiplication sign three". */}
                  <span aria-hidden>×{t.count}</span>
                  <span className="sr-only">{t.count} volte</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Chiudi notifica"
                className="tap pointer-events-auto -mr-1 -mt-0.5 rounded px-1 text-base leading-none opacity-50 hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
