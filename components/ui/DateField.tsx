"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover } from "@/components/ui/Popover";
import {
  addDays,
  addMonths,
  clampIso,
  daysInMonth,
  formatLongIt,
  formatMediumIt,
  monthGrid,
  monthLabelIt,
  parseIso,
  toIso,
  WEEKDAY_INITIALS_IT,
  type Ymd,
} from "@/lib/calendar";

/**
 * A date field with a calendar this app actually drew.
 *
 * `<input type="date">` was doing this job, and `globals.css` had already gone
 * as far as CSS can go with one: the opener button is masked into a Lucide
 * glyph, the segment highlight is gold instead of system blue, the spinner is
 * gone. None of that reaches the part a customer looks at longest — the panel
 * that drops down when they press it. That panel is the UA's, in the UA's font,
 * with the UA's blue selection and the UA's grey chrome, and it is the single
 * loudest piece of borrowed interface on a page otherwise set in Fraunces on
 * paper stock. There is no pseudo-element for it and no property that reaches
 * it; the only way to style it is not to use it.
 *
 * What the platform control was carrying that a div has to earn back, and does:
 * keyboard operation (arrows, Home/End, PageUp/Down), a `name` that a plain
 * `new FormData(form)` still finds, and `required` enforced by the browser's own
 * constraint validation rather than by a hand-rolled check that each caller
 * would have to remember. See `mirrorRef` for how the last two are kept.
 *
 * It also gains the thing the native picker refuses to do: `dayState` greys out
 * the days the shop is shut. The reservation form used to print "Giorni di
 * chiusura: 10–24 agosto" *beside* the field, because it had no way to put that
 * information inside the calendar where the choice is made.
 */

export type DayState = {
  /** Unpickable — a closure, a full batch, a past day. */
  disabled?: boolean;
  /** Read out with the date, e.g. "Chiuso — Ferragosto". */
  note?: string;
  /** A small mark under the number, for a day that is open but worth flagging. */
  marked?: boolean;
};

type Props = {
  id?: string;
  /** Posted under this name; `FormData` sees it exactly as the input did. */
  name?: string;
  value: string;
  onChange: (iso: string) => void;
  /** ISO floor and ceiling, inclusive. */
  min?: string;
  max?: string;
  /**
   * Today in the *shop's* timezone, from the server. Without it the panel simply
   * marks no day as today rather than asking the visitor's clock, which is how
   * a browser a day ahead of Rome ends up offering yesterday.
   */
  today?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Goes on the trigger, so callers keep passing their own `inputClasses`. */
  className?: string;
  invalid?: boolean;
  describedBy?: string;
  dayState?: (iso: string) => DayState | null;
  /** Offers "Cancella" in the footer; off by default since most fields are required. */
  clearable?: boolean;
};

export default function DateField({
  id,
  name,
  value,
  onChange,
  min,
  max,
  today,
  required,
  disabled,
  placeholder = "Scegli una data",
  className,
  invalid,
  describedBy,
  dayState,
  clearable = false,
}: Props) {
  const reactId = useId();
  const panelId = `${id ?? reactId}-calendar`;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLInputElement>(null);
  /**
   * Focus follows the cursor only when the cursor was moved by the keyboard.
   * Paging the month with the mouse must leave focus on the ‹ › button, or the
   * second click lands on a day instead of on the arrow.
   */
  const wantsDayFocus = useRef(false);

  const selected = parseIso(value);
  const fallback = parseIso(today) ?? parseIso(min) ?? null;
  const [cursor, setCursor] = useState<string>("");
  const [view, setView] = useState<Ymd | null>(null);

  const cursorYmd = parseIso(cursor);
  const shown = view ?? cursorYmd ?? selected ?? fallback;

  /**
   * Two different reasons a day cannot be taken, drawn two different ways.
   *
   * `blocked` is simply out of the field's range — yesterday, mostly — and gets
   * the quiet grey a disabled control gets anywhere. `closed` is the shop
   * saying no on a day it would otherwise have said yes, and gets the strike.
   * Collapsing the two struck out every past day in the month in red, which
   * read as an emergency rather than as "that date has been and gone".
   */
  function dayInfo(iso: string): DayState & { blocked: boolean; closed: boolean } {
    const state = dayState?.(iso) ?? null;
    const outOfRange = (min != null && iso < min) || (max != null && iso > max);
    const closed = state?.disabled === true && !outOfRange;
    return { ...state, closed, blocked: outOfRange || state?.disabled === true };
  }

  function openPanel(focusDay: boolean) {
    if (disabled) return;
    const start = value || clampIso(today ?? min ?? "", min, max) || min || "";
    const startYmd = parseIso(start) ?? fallback;
    setCursor(startYmd ? toIso(startYmd) : "");
    setView(startYmd ? { ...startYmd, d: 1 } : null);
    wantsDayFocus.current = focusDay;
    setOpen(true);
  }

  function closePanel(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function commit(iso: string) {
    if (dayInfo(iso).blocked) return;
    onChange(iso);
    closePanel(true);
  }

  function moveCursor(delta: number, unit: "day" | "month" | "year") {
    const from = parseIso(cursor) ?? shown;
    if (!from) return;
    const next =
      unit === "day"
        ? addDays(from, delta)
        : addMonths(from, unit === "month" ? delta : delta * 12);
    const iso = clampIso(toIso(next), min, max);
    const landed = parseIso(iso);
    if (!landed) return;
    wantsDayFocus.current = true;
    setCursor(iso);
    setView({ ...landed, d: 1 });
  }

  // The cursor's own button takes focus after the render that moved it — the
  // element only exists once the new month has been laid out.
  useEffect(() => {
    if (!open || !wantsDayFocus.current) return;
    wantsDayFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>('[data-cursor="true"]')?.focus();
  });

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, [number, "day" | "month" | "year"]> = {
      ArrowLeft: [-1, "day"],
      ArrowRight: [1, "day"],
      ArrowUp: [-7, "day"],
      ArrowDown: [7, "day"],
      PageUp: [-1, event.shiftKey ? "year" : "month"],
      PageDown: [1, event.shiftKey ? "year" : "month"],
    };
    const move = step[event.key];
    if (move) {
      event.preventDefault();
      moveCursor(move[0], move[1]);
      return;
    }
    const from = parseIso(cursor);
    if ((event.key === "Home" || event.key === "End") && from) {
      event.preventDefault();
      // The row, not the month: a week is the unit the grid is built in, and
      // it is what Home/End means in every other date picker.
      const weekday = monthGrid(from.y, from.m).indexOf(cursor) % 7;
      moveCursor(event.key === "Home" ? -weekday : 6 - weekday, "day");
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (cursor) commit(cursor);
    }
  }

  const grid = shown ? monthGrid(shown.y, shown.m) : [];
  const label = value ? formatMediumIt(value) : placeholder;
  // Paging stops where the range does: the previous month is unreachable once
  // its *last* day is already before `min`, the next once its first is past
  // `max`. Tested on the boundary day rather than the 1st, so the month holding
  // `min` itself stays reachable.
  const prevMonth = shown ? addMonths({ ...shown, d: 1 }, -1) : null;
  const nextMonth = shown ? addMonths({ ...shown, d: 1 }, 1) : null;
  const prevBlocked = Boolean(
    min && prevMonth && toIso({ ...prevMonth, d: daysInMonth(prevMonth.y, prevMonth.m) }) < min,
  );
  const nextBlocked = Boolean(max && nextMonth && toIso({ ...nextMonth, d: 1 }) > max);

  return (
    <div className="pop-field">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        // The APG's date-picker-combobox shape. `role="button"` would be the
        // honest description of the element and is the wrong one for the job:
        // a button supports neither `aria-expanded` as a value-bearing state
        // nor `aria-invalid`, so a closed day announced nothing and a refused
        // date announced nothing either.
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-invalid={invalid || undefined}
        data-empty={value ? undefined : true}
        onClick={() => (open ? closePanel(false) : openPanel(false))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            if (open) return;
            event.preventDefault();
            openPanel(true);
          }
        }}
        className={cn("pop-trigger", className)}
      >
        <span className="pop-trigger-value">{label}</span>
        <Calendar aria-hidden className="pop-trigger-icon" />
      </button>

      {/*
       * The control the form actually reads.
       *
       * A `<button>` posts nothing and validates nothing, so the field's name and
       * its `required` live on a real input that is laid out over the trigger at
       * zero opacity. Opacity rather than `display: none` or `hidden` on purpose:
       * the browser refuses to report a constraint violation it cannot focus
       * ("An invalid form control … is not focusable") and silently drops the
       * submit instead, so a hidden input would turn `required` off *and* break
       * the form. At zero opacity it is focusable, the bubble points at the right
       * box, and `new FormData(form)` finds the same `name` it always did.
       *
       * Not `readOnly`, for the same reason: a readonly control is barred from
       * constraint validation, which is exactly the thing being preserved.
       */}
      <input
        ref={mirrorRef}
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
        id={panelId}
        className="pop-calendar"
        aria-label="Calendario"
      >
        <div className="pop-head">
          <button
            type="button"
            className="pop-nav"
            aria-label="Mese precedente"
            disabled={prevBlocked}
            onClick={() => shown && setView({ ...addMonths(shown, -1), d: 1 })}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <span className="pop-month font-display" aria-live="polite">
            {shown ? monthLabelIt(shown.y, shown.m) : ""}
          </span>
          <button
            type="button"
            className="pop-nav"
            aria-label="Mese successivo"
            disabled={nextBlocked}
            onClick={() => shown && setView({ ...addMonths(shown, 1), d: 1 })}
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>

        <div className="pop-weekdays" aria-hidden>
          {WEEKDAY_INITIALS_IT.map((initial, i) => (
            <span key={i}>{initial}</span>
          ))}
        </div>

        {/* One `grid` role over 42 buttons, with a roving tabindex: the whole
            calendar is a single tab stop, which is what a keyboard user expects
            from the native control this replaces. */}
        <div ref={gridRef} role="grid" className="pop-grid" onKeyDown={onGridKeyDown}>
          {grid.map((iso) => {
            const ymd = parseIso(iso)!;
            const info = dayInfo(iso);
            const outside = shown != null && ymd.m !== shown.m;
            const isSelected = value === iso;
            const isCursor = cursor === iso;
            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                tabIndex={isCursor ? 0 : -1}
                data-cursor={isCursor || undefined}
                data-selected={isSelected || undefined}
                data-today={today === iso || undefined}
                data-outside={outside || undefined}
                data-blocked={info.blocked || undefined}
                data-closed={info.closed || undefined}
                data-marked={info.marked || undefined}
                aria-selected={isSelected}
                aria-disabled={info.blocked || undefined}
                aria-label={`${formatLongIt(iso)}${info.note ? ` — ${info.note}` : ""}`}
                title={info.note ?? undefined}
                onClick={() => commit(iso)}
                onFocus={() => setCursor(iso)}
                className="pop-day"
              >
                {ymd.d}
              </button>
            );
          })}
        </div>

        <div className="pop-foot">
          {today && !dayInfo(today).blocked ? (
            <button type="button" className="pop-foot-action" onClick={() => commit(today)}>
              Oggi
            </button>
          ) : (
            <span className="pop-foot-note">{value ? formatLongIt(value) : "Nessuna data scelta"}</span>
          )}
          {clearable && value && (
            <button
              type="button"
              className="pop-foot-action"
              onClick={() => {
                onChange("");
                closePanel(true);
              }}
            >
              Cancella
            </button>
          )}
        </div>
      </Popover>
    </div>
  );
}
