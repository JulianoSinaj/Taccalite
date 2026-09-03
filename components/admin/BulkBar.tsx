"use client";

import { useEffect, useRef, useState } from "react";
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
 * toggle, and collapsing the action controls until something is selected.
 *
 * The collapse itself is CSS, not this component's state — see `.bulk-actions`
 * in globals.css. Doing it here would either flash the full bar on every load
 * (the server renders with a count of zero) or take the bulk actions away from
 * an operator with no JS, which is exactly the case the `form="…"` wiring above
 * exists to serve.
 */
export function BulkBar({
  formId,
  action,
  options,
  label,
  one,
  gender = "m",
  confirmTemplate,
}: {
  /** Must match the `form="…"` on the row checkboxes. */
  formId: string;
  action: Action;
  /** The statuses that may be applied to a whole selection. */
  options: { value: string; label: string }[];
  /** Plural noun for the counter, e.g. "ordini". */
  label: string;
  /** Singular of `label`, for the count line: "1 ordine selezionato". */
  one: string;
  /**
   * Grammatical gender of the noun, because the participle has to agree with
   * it: "3 prenotazioni selezionate", not "selezionati". The bar used to print
   * one hard-coded masculine plural for all three lists, so the reservations
   * list read "1 prenotazioni selezionati" — wrong on both counts at once.
   */
  gender?: "m" | "f";
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
  const [total, setTotal] = useState(0);
  const allRef = useRef<HTMLInputElement>(null);

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
    const sync = () => {
      const all = boxes();
      setTotal(all.length);
      setCount(all.filter((b) => b.checked).length);
    };
    document.addEventListener("change", sync);
    // Pick up any boxes the browser restored on a back-navigation.
    const id = requestAnimationFrame(sync);
    return () => {
      document.removeEventListener("change", sync);
      cancelAnimationFrame(id);
    };
  }, [formId]);

  // `indeterminate` is a property, not an attribute, so React cannot set it
  // from JSX. Without it the box was `checked` whenever *anything* was ticked:
  // tick one row of twenty-five and "Seleziona tutto" drew itself full, so the
  // next click on it read as "untick" to the browser and cleared the selection
  // the operator was trying to extend. Now it draws the dash that means "some".
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = count > 0 && count < total;
  }, [count, total]);

  function toggleAll(checked: boolean) {
    for (const b of document.querySelectorAll<HTMLInputElement>(
      `input[type="checkbox"][name="ids"][form="${formId}"]`,
    )) {
      b.checked = checked;
    }
    setCount(checked ? document.querySelectorAll(`input[name="ids"][form="${formId}"]`).length : 0);
  }

  const agree = (n: number) => (gender === "f" ? (n === 1 ? "a" : "e") : n === 1 ? "o" : "i");
  // At zero the noun adds nothing, and naming it actively hurts: "Nessun ordine
  // selezionato" reads at a glance like the list's own empty state ("Nessun
  // ordine corrisponde ai filtri") while twenty-five orders are on screen —
  // which is also what `e2e/admin-forms.spec.ts` checks for when it asks whether
  // a saved order made it into the list.
  const summary =
    count === 0
      ? "Nessun elemento selezionato"
      : `${count} ${count === 1 ? one : label} selezionat${agree(count)}`;

  return (
    // Sticky only once something is selected. A bar that follows you down the
    // page while it has nothing to apply is just a strip of the list you cannot
    // read; a bar that follows you while forty orders are ticked is the whole
    // point — the rows are above the fold and the action was below it.
    // `--admin-top` is the sticky mobile bar's height, 0 on desktop.
    <div
      className={`mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brown-900/10 bg-surface px-4 py-3 shadow-sm ${
        count > 0 ? "sticky top-[var(--admin-top)] z-20" : ""
      }`}
    >
      <label className="tap flex items-center gap-2 text-xs font-bold tracking-widest text-brown-800/70 uppercase">
        <input
          ref={allRef}
          type="checkbox"
          onChange={(e) => toggleAll(e.target.checked)}
          // Full only when the whole page is ticked; the effect above draws the
          // in-between state.
          checked={total > 0 && count === total}
          className="size-5 rounded accent-brown-950"
          aria-label="Seleziona tutto"
        />
        Seleziona tutto
      </label>

      <span className="text-sm text-brown-800/70" aria-live="polite">
        {summary}
      </span>

      <ActionForm
        id={formId}
        action={action}
        // `bulk-actions` is what collapses this group until a row is ticked. It
        // cost 223px of a 390px phone screen to sit there disabled, directly
        // between the filters and the first row of the list it applies to.
        className="bulk-actions w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto"
      >
        <select
          name="status"
          className={`${inputCls} w-full sm:w-44`}
          aria-label="Azione in blocco"
          disabled={count === 0}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {/* Disabled at zero like the select beside it: submitting an empty
            selection only ever produced "nessun elemento selezionato" from the
            action, which is a round trip to say what the bar already says. */}
        <PendingButton
          tone="dark"
          disabled={count === 0}
          confirm={count > 0 && confirmTemplate ? confirmTemplate.replace("{n}", String(count)) : undefined}
        >
          Applica a {count}
        </PendingButton>
      </ActionForm>
    </div>
  );
}

/** The per-row checkbox that joins a `BulkBar`'s form.
 *
 * Wrapped in a label because `.tap` works by way of an `::after`, and a replaced
 * element like `<input>` has no pseudo-elements to grow — so a bare checkbox
 * stays a 20px target in a 56px row however the class is applied. The label
 * carries no text; the accessible name is the input's own `aria-label`. */
export function BulkCheckbox({ formId, id, label }: { formId: string; id: string; label: string }) {
  return (
    <label className="tap mt-0.5 inline-flex shrink-0 items-center">
      <input
        type="checkbox"
        name="ids"
        value={id}
        form={formId}
        aria-label={label}
        className="size-5 rounded accent-brown-950"
      />
    </label>
  );
}
