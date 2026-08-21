"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * The confirmation step for a destructive action.
 *
 * Replaces `window.confirm`, which blocks the whole browser, can't be styled,
 * can't be read by the page's own assistive context, and is silently suppressed
 * by some browsers when a user ticks "prevent additional dialogs" — turning a
 * guarded action into an unguarded one.
 *
 * Built on `<dialog>` rather than pulling in a modal library: the platform
 * element already gives focus trapping, Escape-to-close and an inert backdrop,
 * and the admin only ever shows one of these at a time.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Conferma",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "dark";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const tones = {
    danger: "bg-danger-solid text-danger-solid-fg hover:brightness-110",
    dark: "bg-brown-950 text-cream hover:bg-brown-900",
  };

  return (
    <dialog
      ref={ref}
      // Escape and backdrop dismissal both mean "no".
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
      // `max-h` + scroll because a long confirmation ("applicare a 40 ordini?
      // i clienti riceveranno le email previste") overflowed a small phone with
      // no way to reach the buttons. `dvh`, so the browser chrome is excluded.
      className="max-h-[85dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-2xl border border-brown-900/10 bg-surface p-0 text-brown-950 shadow-xl backdrop:bg-brown-950/40"
      aria-labelledby="confirm-title"
    >
      <div className="p-6">
        <div className="flex gap-3">
          <AlertTriangle
            className={`mt-0.5 size-5 shrink-0 ${tone === "danger" ? "text-danger" : "text-gold-deep"}`}
            aria-hidden
          />
          <div>
            <h2 id="confirm-title" className="font-display text-lg text-brown-950">
              {title}
            </h2>
            <div className="mt-1.5 text-sm leading-relaxed text-brown-800/80">{message}</div>
          </div>
        </div>
        {/* Reversed on a phone so the confirming action is the one under the
            thumb, and both are full width rather than two short pills wrapping
            unpredictably. */}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brown-900/10 px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15 sm:w-auto"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`inline-flex min-h-11 w-full items-center justify-center rounded-full px-5 py-2.5 text-xs font-bold tracking-widest uppercase sm:w-auto ${tones[tone]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
