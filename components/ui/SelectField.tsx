"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover } from "@/components/ui/Popover";

/**
 * A `<select>` whose dropdown belongs to this app.
 *
 * The closed control was never the problem — it takes classes like any other
 * field, and did. The list it drops is a platform menu: system font, system
 * highlight, system metrics, rendered by the OS outside the page entirely. On
 * Windows that is a flat grey rectangle with a blue bar in it; on macOS it is a
 * translucent panel that covers the field. Neither has ever been reachable from
 * CSS, and on a page set in Fraunces on paper stock both read as another
 * program's window opening on top of ours.
 *
 * Same contract as `DateField`: a hidden-by-opacity input carries the `name` and
 * the `required` so `new FormData(form)` and the browser's own validation keep
 * working, and the trigger is an ARIA combobox rather than a div with a click
 * handler — arrows, Home/End, Enter, Escape and type-ahead all behave the way
 * the control it replaces did.
 */

export type SelectOption = {
  value: string;
  label: string;
  /** The second line — a sede's speciality, a slot's remaining capacity. */
  hint?: string;
  disabled?: boolean;
};

type Props = {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  invalid?: boolean;
  describedBy?: string;
  /** Line the values up as figures — time slots, quantities. */
  numeric?: boolean;
  /** Cap on the panel before it scrolls; times need it, two shops do not. */
  maxVisible?: number;
};

export default function SelectField({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = "Scegli…",
  required,
  disabled,
  className,
  invalid,
  describedBy,
  numeric = false,
  maxVisible = 8,
}: Props) {
  const reactId = useId();
  const baseId = id ?? reactId;
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Type-ahead buffer, cleared a second after the last keystroke. */
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  function openPanel(startAt = selectedIndex) {
    if (disabled) return;
    setActive(startAt >= 0 ? startAt : firstEnabled(0, 1));
    setOpen(true);
  }

  function closePanel(restoreFocus: boolean) {
    setOpen(false);
    setActive(-1);
    if (restoreFocus) triggerRef.current?.focus();
  }

  /** The next option that can actually be chosen, walking in `step`. */
  function firstEnabled(from: number, step: number): number {
    for (let i = from; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled) return i;
    }
    return -1;
  }

  function commit(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    closePanel(true);
  }

  // Keep the active row in view while arrowing through a long list of times.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function typeAhead(key: string) {
    const now = performance.now();
    const text = (now - typed.current.at < 1000 ? typed.current.text : "") + key.toLowerCase();
    typed.current = { text, at: now };
    const start = active >= 0 ? active : 0;
    // Search from the row after the current one and wrap, so pressing the same
    // letter twice steps through the options beginning with it.
    for (let i = 1; i <= options.length; i += 1) {
      const index = (start + (text.length > 1 ? 0 : i)) % options.length;
      const option = options[index];
      if (!option.disabled && option.label.toLowerCase().startsWith(text)) {
        setActive(index);
        if (!open) onChange(option.value);
        return;
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) return openPanel();
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = firstEnabled((active < 0 ? (step > 0 ? -1 : options.length) : active) + step, step);
        if (next >= 0) setActive(next);
        return;
      }
      case "Home":
      case "End": {
        if (!open) return;
        event.preventDefault();
        const next =
          event.key === "Home" ? firstEnabled(0, 1) : firstEnabled(options.length - 1, -1);
        if (next >= 0) setActive(next);
        return;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        if (!open) return openPanel();
        if (active >= 0) commit(active);
        return;
      }
      case "Tab": {
        // Tabbing away commits nothing and closes — the same as a native select
        // that was opened and left alone.
        if (open) closePanel(false);
        return;
      }
      default: {
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          typeAhead(event.key);
        }
      }
    }
  }

  return (
    <div className="pop-field">
      <button
        ref={triggerRef}
        type="button"
        id={baseId}
        role="combobox"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-invalid={invalid || undefined}
        data-empty={selected ? undefined : true}
        onClick={() => (open ? closePanel(false) : openPanel())}
        onKeyDown={onKeyDown}
        className={cn("pop-trigger", numeric && "tabular-nums", className)}
      >
        <span className="pop-trigger-value">{selected ? selected.label : placeholder}</span>
        <ChevronDown aria-hidden className="pop-trigger-icon pop-trigger-chevron" />
      </button>

      {/* The named, validated control — see the note in `DateField`. */}
      <input
        className="pop-mirror"
        tabIndex={-1}
        aria-hidden
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onInvalid={() => setOpen(false)}
      />

      <Popover
        open={open}
        anchorRef={triggerRef}
        onDismiss={(reason) => closePanel(reason === "escape")}
        matchWidth
        role="listbox"
        id={listId}
        aria-label={placeholder}
      >
        <div
          ref={listRef}
          className="pop-list"
          style={{ ["--pop-max-rows" as string]: String(maxVisible) }}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              data-index={index}
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              data-active={index === active || undefined}
              data-chosen={option.value === value || undefined}
              data-blocked={option.disabled || undefined}
              // `pointerdown` and not `click`: the panel's own outside-pointer
              // dismissal fires on pointerdown too, and a click handler would
              // lose the race on a touchscreen.
              onPointerDown={(event) => {
                event.preventDefault();
                commit(index);
              }}
              onPointerEnter={() => !option.disabled && setActive(index)}
              className={cn("pop-option", numeric && "tabular-nums")}
            >
              <span className="pop-option-body">
                <span className="pop-option-label">{option.label}</span>
                {option.hint && <span className="pop-option-hint">{option.hint}</span>}
              </span>
              <Check aria-hidden className="pop-option-check" />
            </div>
          ))}
          {options.length === 0 && <p className="pop-empty">Nessuna opzione disponibile</p>}
        </div>
      </Popover>
    </div>
  );
}
