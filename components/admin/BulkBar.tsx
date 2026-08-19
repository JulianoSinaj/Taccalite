"use client";

import { useEffect, useState } from "react";
import { inputCls } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import type { ActionState } from "@/lib/admin/action-state";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Bulk action bar for a list.
 *
 * The row checkboxes are plain server-rendered inputs that join this form via
 * the HTML `form="<formId>"` attribute — so selection and submission work even
 * before this component hydrates, and the rows don't have to live inside a form
 * (they already contain their own per-row forms, which can't nest).
 *
 * What this adds on top is the interactive part: a live count, a select-all
 * toggle, and hiding the bar until something is actually selected.
 */
export function BulkBar({
  formId,
  action,
  options,
  label,
  confirmTemplate,
}: {
  /** Must match the `form="…"` on the row checkboxes. */
  formId: string;
  action: Action;
  /** The statuses that may be applied to a whole selection. */
  options: { value: string; label: string }[];
  /** Noun for the counter, e.g. "ordini". */
  label: string;
  /**
   * Confirmation text, with `{n}` standing in for the selected count.
   *
   * A plain string, not a `(n) => string` callback: this is a client component
   * rendered from a server one, and React cannot serialise a function across
   * that boundary — passing one threw "Functions cannot be passed directly to
   * Client Components" and dropped the whole list into its error boundary
   * whenever the bar rendered.
   */
  confirmTemplate?: string;
}) {
  const [count, setCount] = useState(0);

  // Track the checkboxes that belong to this form. They are rendered by the
  // server inside the rows, so we listen at the document level rather than
  // owning them.
  useEffect(() => {
    const boxes = () =>
      Array.from(
        document.querySelectorAll<HTMLInputElement>(
          `input[type="checkbox"][name="ids"][form="${formId}"]`,
        ),
      );
    const sync = () => setCount(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", sync);
    // Pick up any boxes the browser restored on a back-navigation.
    const id = requestAnimationFrame(sync);
    return () => {
      document.removeEventListener("change", sync);
      cancelAnimationFrame(id);
    };
  }, [formId]);

  function toggleAll(checked: boolean) {
    for (const b of document.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][name="ids"][form="${formId}"]`,
    )) {
      b.checked = checked;
    }
    setCount(checked ? document.querySelectorAll(`input[name="ids"][form="${formId}"]`).length : 0);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brown-900/10 bg-surface px-4 py-3 shadow-sm">
      <label className="flex items-center gap-2 text-xs font-bold tracking-widest text-brown-800/70 uppercase">
        <input
          type="checkbox"
          onChange={(e) => toggleAll(e.target.checked)}
          checked={count > 0}
          className="h-4 w-4 rounded accent-brown-950"
          aria-label="Seleziona tutto"
        />
        Seleziona tutto
      </label>

      <span className="text-sm text-brown-800/70">
        {count === 0 ? `Nessun elemento selezionato` : `${count} ${label} selezionati`}
      </span>

      <ActionForm id={formId} action={action} className="ml-auto flex flex-wrap items-center gap-2">
        <select name="status" className={`${inputCls} w-44`} aria-label="Azione in blocco" disabled={count === 0}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <PendingButton
          tone="dark"
          confirm={count > 0 && confirmTemplate ? confirmTemplate.replace("{n}", String(count)) : undefined}
        >
          Applica a {count}
        </PendingButton>
      </ActionForm>
    </div>
  );
}

/** The per-row checkbox that joins a `BulkBar`'s form. */
export function BulkCheckbox({ formId, id, label }: { formId: string; id: string; label: string }) {
  return (
    <input
      type="checkbox"
      name="ids"
      value={id}
      form={formId}
      aria-label={label}
      className="mt-1 h-4 w-4 shrink-0 rounded accent-brown-950"
    />
  );
}
