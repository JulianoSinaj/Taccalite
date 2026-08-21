"use client";

import {
  createContext,
  useCallback,
  useContext,
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
 */

type Toast = { id: number; status: "success" | "error"; message: string };

const SUCCESS_MS = 4000;
const ERROR_MS = 9000;

const ToastContext = createContext<(state: ActionState) => void>(() => {});

/** Publish an ActionState as a toast. Idle/empty results are ignored. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((state: ActionState) => {
    if (state.status === "idle" || !state.message) return;
    const id = (nextId.current += 1);
    const status = state.status;
    const message = state.message;
    setToasts((prev) => [...prev, { id, status, message }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      status === "error" ? ERROR_MS : SUCCESS_MS,
    );
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

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
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
                t.status === "error"
                  ? "border-danger/30 bg-danger-soft text-danger-soft-fg"
                  : "border-ok/40 bg-ok-soft text-ok-soft-fg"
              }`}
            >
              <span aria-hidden className="mt-px font-bold">
                {t.status === "error" ? "!" : "✓"}
              </span>
              <p className="flex-1 font-medium">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Chiudi notifica"
                className="tap -mr-1 -mt-0.5 rounded px-1 text-base leading-none opacity-50 hover:opacity-100"
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
