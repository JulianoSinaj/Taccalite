"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * The floating panel behind the date picker and the select menu.
 *
 * Deliberately **not** portalled to `<body>`. Every colour in this app is a
 * custom property declared on an ancestor — `[data-theme]` in the gestionale,
 * `.site-shell` on the storefront (which also re-points the two font faces) —
 * so a panel rendered as a child of `<body>` would resolve the light ramp on a
 * dark dashboard and the admin's Open Sans on a page set in Inter Tight, with
 * nothing in the styles to explain it. Staying inside the field's own wrapper
 * costs one `relative` box and inherits all of it for free.
 *
 * What that gives up is escaping an `overflow: hidden` ancestor. The trade is
 * worth it here: these panels open from form fields, not from inside scrolling
 * table cells, and the flip logic below handles the one clipping edge that
 * actually bites — the bottom of the viewport.
 */

type Placement = "bottom" | "top";
type Align = "start" | "end";

export type PopoverProps = {
  open: boolean;
  /** The control the panel hangs off — measured to decide up/down, left/right. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Fired for an outside pointer or Escape; Escape also restores focus. */
  onDismiss: (reason: "escape" | "outside") => void;
  children: ReactNode;
  /** Menus match the field's width; a calendar sizes to its own grid. */
  matchWidth?: boolean;
  className?: string;
  role?: "dialog" | "listbox";
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-activedescendant"?: string;
  tabIndex?: number;
};

/**
 * The open/closed switch lives out here so that everything below — including a
 * `useLayoutEffect` — mounts only once there is a panel to measure.
 *
 * Not cosmetic: a `useLayoutEffect` in a component that renders on the server
 * logs "useLayoutEffect does nothing on the server" on every request that puts
 * a field on the page, and this project has just spent three commits clearing
 * exactly that class of noise out of the console.
 */
export function Popover({ open, ...rest }: PopoverProps) {
  if (!open) return null;
  return <PopoverPanel {...rest} />;
}

function PopoverPanel({
  anchorRef,
  onDismiss,
  children,
  matchWidth = false,
  className,
  role = "dialog",
  id,
  tabIndex,
  ...aria
}: Omit<PopoverProps, "open">) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement>("bottom");
  const [align, setAlign] = useState<Align>("start");
  /**
   * Read inside the listeners rather than closed over, so re-subscribing every
   * document listener is not the price of the caller passing a fresh
   * `onDismiss` arrow on each render. Assigned in an effect and not in the
   * render body — the React Compiler lint refuses a ref write during render,
   * and it is right to: a render that is thrown away must not have left
   * anything behind.
   */
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  /**
   * Placement is measured, not guessed. A field near the fold would otherwise
   * open a 22rem calendar off the bottom of the screen — and on a phone that is
   * the *usual* case for the reservation form, whose date row sits low enough
   * that "below" is never the right answer.
   *
   * `useLayoutEffect` so the decision lands before the panel is painted;
   * measuring in a passive effect shows one frame in the wrong place, which
   * reads as a flicker.
   */
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    function place() {
      const box = anchor!.getBoundingClientRect();
      const height = panel!.offsetHeight;
      const width = panel!.offsetWidth;
      const gutter = 8;
      const below = window.innerHeight - box.bottom;
      const above = box.top;
      setPlacement(below < height + gutter && above > below ? "top" : "bottom");
      // Only ever true for a panel wider than its trigger: right-align it when a
      // left-aligned one would run off the edge of the viewport.
      setAlign(!matchWidth && box.left + width + gutter > window.innerWidth ? "end" : "start");
    }

    place();
    // The panel's own height changes when a menu is filtered down to two rows;
    // re-measure rather than assume it is what it was when it opened.
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    // Capture, so a scrolling ancestor counts and not only the window.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, matchWidth]);

  // Dismissal: outside pointer, Escape. Same shape as the account menu in the
  // header — `pointerdown` rather than `click`, so a drag that starts outside
  // closes it, and Escape names itself so the caller can restore focus.
  useEffect(() => {
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      dismissRef.current("outside");
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismissRef.current("escape");
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorRef]);

  return (
    <div
      ref={panelRef}
      id={id}
      role={role}
      tabIndex={tabIndex}
      data-placement={placement}
      data-align={align}
      className={cn("pop-panel", matchWidth && "pop-panel-match", className)}
      {...aria}
    >
      {children}
    </div>
  );
}
