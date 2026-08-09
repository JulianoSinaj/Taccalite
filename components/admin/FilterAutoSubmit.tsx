"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for the filter toolbar.
 *
 * Without JS the toolbar is a plain GET form and the "Filtra" button applies it.
 * With JS, picking a value from a select applies it immediately — the one-click
 * feel of the old chip rows, without their vertical footprint.
 *
 * It also drops empty facets on submit (a GET form otherwise posts `?stato=&q=`
 * for every untouched field), so the resulting URL contains only the filters
 * that are actually on and stays shareable.
 */
export default function FilterAutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const onChange = (event: Event) => {
      if (event.target instanceof HTMLSelectElement) form.requestSubmit();
    };
    const onSubmit = () => {
      // A disabled control is not serialised, which is the only way to omit a
      // field from a native GET submission. The page navigates away immediately
      // after, so nothing needs re-enabling.
      for (const el of Array.from(form.elements)) {
        const isEmptyField =
          (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) &&
          el.type !== "submit" &&
          el.value === "";
        if (isEmptyField) el.disabled = true;
      }
    };

    form.addEventListener("change", onChange);
    form.addEventListener("submit", onSubmit);
    return () => {
      form.removeEventListener("change", onChange);
      form.removeEventListener("submit", onSubmit);
    };
  }, [formId]);

  return null;
}
