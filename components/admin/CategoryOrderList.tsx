"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { Panel, StatusBadge } from "@/components/admin/ui";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { useToast } from "@/components/admin/Toasts";
import { toggleCategoryActive, deleteCategory, moveCategory, reorderCategories } from "@/lib/admin/category-actions";
import { countOf, type Kind, type KindMeta } from "@/lib/admin/category-kinds";
import { vatRateLabel } from "@/lib/fiscal";
import type { CategoryWithUsage } from "@/lib/admin/queries";

const BASE = "/admin/categories";

const pillCls =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15";

const idsOf = (list: CategoryWithUsage[]) => list.map((c) => c.id);

/** How many *other* rows the pointer has visually passed — i.e. the index the
 *  dragged row should occupy if dropped right now. */
function indexForPointer(
  order: CategoryWithUsage[],
  draggedId: string,
  pointerY: number,
  rows: Map<string, HTMLDivElement>,
): number {
  let index = 0;
  for (const c of order) {
    if (c.id === draggedId) continue;
    const el = rows.get(c.id);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (pointerY > rect.top + rect.height / 2) index++;
  }
  return index;
}

/* ----------------------------------------------------------------------------
 * Drag-and-drop reordering
 *
 * Rows only ever drag within their own sibling group (same kind, same parent —
 * the same rule `moveCategory` enforces), so one `DragGroup` is mounted for the
 * top-level list and one more per parent's children. That makes an invalid drop
 * structurally impossible instead of something to validate after the fact.
 *
 * There is no drag-and-drop library here: pointer events plus a FLIP animation
 * for the rows making way. Every DOM/ref touch is confined to `useLayoutEffect`,
 * `useEffect` or a `useCallback` body — never the render path itself — which is
 * both the React-correct place for it and what the project's ref-safety lint
 * rule (see AGENTS.md) requires. Rows carry a plain `data-row-id` attribute
 * instead of a per-row ref callback; the id → element map is rebuilt from the
 * DOM in the layout effect, where a ref write is unambiguously safe.
 *
 * The dragged row is positioned directly from the pointer instead of animated,
 * but every time a swap changes its place in the DOM flow its *static*
 * position jumps too — measured live (transform momentarily cleared) in the
 * same layout effect that FLIPs the other rows, and folded into its offset so
 * the visible position never jumps, regardless of how tall a swapped-past row
 * is (a parent with children is a much taller "row" than a childless one).
 * ------------------------------------------------------------------------- */

function DragGroup({
  kind,
  parentId,
  items,
  disabled,
  render,
}: {
  kind: Kind;
  parentId: string | null;
  items: CategoryWithUsage[];
  /** True while a search is active — dragging a filtered subset would silently
   *  reorder against neighbours that aren't its true siblings, so the handle is
   *  inert (not hidden — losing the affordance reads as "this category lost its
   *  order") until the operator clears the search. */
  disabled: boolean;
  render: (c: CategoryWithUsage, opts: { isDragging: boolean; dragDisabled: boolean }) => ReactNode;
}) {
  const [order, setOrder] = useState(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const rowMap = useRef(new Map<string, HTMLDivElement>());
  const flipTops = useRef(new Map<string, number>());
  const drag = useRef<{ startPointerY: number; lastPointerY: number; baseOffset: number } | null>(null);
  // Mirrors `order` so the pointerup handler (below) can read the row order a
  // drag actually ended on without needing `order` in its effect's deps — that
  // would re-subscribe the window listeners on every single swap mid-drag.
  const orderRef = useRef(order);
  const toast = useToast();
  const router = useRouter();

  // Resync with the server once it's caught up — but never mid-drag, and never
  // while our own reorder is still in flight (the server hasn't echoed it yet).
  useEffect(() => {
    if (draggingId || saving) return;
    setOrder(items);
  }, [items, draggingId, saving]);

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  useLayoutEffect(() => {
    // Rebuild the id → element map straight from the DOM — every row already
    // carries `data-row-id`, so no per-row ref callback is needed to collect it.
    const map = new Map<string, HTMLDivElement>();
    const container = containerRef.current;
    if (container) {
      for (const child of Array.from(container.children)) {
        const id = (child as HTMLElement).dataset.rowId;
        if (id) map.set(id, child as HTMLDivElement);
      }
    }
    rowMap.current = map;

    // FLIP: rows displaced by a swap slide into place instead of popping there.
    const prev = flipTops.current;
    const next = new Map<string, number>();
    for (const c of order) {
      const el = map.get(c.id);
      if (!el) continue;

      if (c.id === draggingId && drag.current) {
        // Measure this row's true static top (transform cleared), fold any
        // jump since the last measurement into the running offset, then
        // reapply — all before paint, so nothing is ever visible mid-jump.
        el.style.transform = "";
        const top = el.getBoundingClientRect().top;
        next.set(c.id, top);
        const before = prev.get(c.id);
        if (before != null) drag.current.baseOffset += before - top;
        el.style.transition = "none";
        el.style.transform = `translateY(${drag.current.lastPointerY - drag.current.startPointerY + drag.current.baseOffset}px)`;
        continue;
      }

      const top = el.getBoundingClientRect().top;
      next.set(c.id, top);
      const before = prev.get(c.id);
      if (before != null && Math.abs(before - top) > 0.5) {
        el.style.transition = "none";
        el.style.transform = `translateY(${before - top}px)`;
        el.getBoundingClientRect(); // force the browser to register the start position
        requestAnimationFrame(() => {
          el.style.transition = "transform 180ms cubic-bezier(0.2,0,0,1)";
          el.style.transform = "";
        });
      } else if (c.id !== draggingId) {
        el.style.transition = "";
        el.style.transform = "";
      }
    }
    flipTops.current = next;
  }, [order, draggingId]);

  const persist = useCallback(
    (next: CategoryWithUsage[]) => {
      if (idsOf(next).join("|") === idsOf(items).join("|")) return;
      setSaving(true);
      startTransition(async () => {
        const result = await reorderCategories(kind, parentId, idsOf(next));
        toast(result);
        if (result.status === "success") router.refresh();
        else setOrder(items); // revert to the last order the server actually has
        setSaving(false);
      });
    },
    [items, kind, parentId, toast, router],
  );

  // The pointer that's dragging is tracked at the window level rather than via
  // per-row handlers: it needs to keep receiving move/up events wherever the
  // finger or cursor ends up, not just while it's over the row it started on.
  useEffect(() => {
    if (!draggingId) return;
    const id = draggingId;

    function onMove(e: PointerEvent) {
      if (!drag.current) return;
      drag.current.lastPointerY = e.clientY;
      const row = rowMap.current.get(id);
      if (row) {
        row.style.transition = "none";
        row.style.transform = `translateY(${e.clientY - drag.current.startPointerY + drag.current.baseOffset}px)`;
      }
      setOrder((current) => {
        const currentIndex = current.findIndex((c) => c.id === id);
        const targetIndex = indexForPointer(current, id, e.clientY, rowMap.current);
        if (targetIndex === currentIndex) return current;
        // The static-position jump this causes is compensated in the layout
        // effect above, which measures it live rather than assuming a row height.
        const next = [...current];
        const [moved] = next.splice(currentIndex, 1);
        next.splice(targetIndex, 0, moved!);
        return next;
      });
    }

    function finish() {
      const row = rowMap.current.get(id);
      if (row) {
        row.style.transition = "";
        row.style.transform = "";
        row.style.zIndex = "";
      }
      drag.current = null;
      setDraggingId(null);
      // `persist` itself calls `setSaving`/`startTransition`; running it from a
      // `setOrder` updater (to read the current order without `order` in this
      // effect's deps) trips React's "cannot update state while rendering" —
      // updaters must stay pure. `orderRef` gives the same up-to-date read
      // for free, since nothing here is part of a render pass.
      persist(orderRef.current);
    }

    window.addEventListener("pointermove", onMove);
    // A cancelled gesture (browser back-swipe, alt-tab) still lands wherever it
    // currently is — reverting silently would just make the operator redo it.
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [draggingId, persist]);

  // One delegated listener for the whole group rather than a handler per row:
  // a grip button only ever carries a static `data-drag-handle` marker (never a
  // function prop), so no ref-derived callback has to cross the `render`
  // boundary into `CategoryRow`/`DragHandle` — it's found here instead, by
  // walking up from whatever the pointer actually went down on.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;
    function onDown(e: PointerEvent) {
      if (order.length < 2) return;
      const handle = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-drag-handle]");
      const id = handle?.dataset.rowId;
      if (!id) return;
      const row = rowMap.current.get(id);
      // Not one of this group's own rows — a child row's handle bubbles up
      // through its parent's DragGroup container too, since children render
      // nested inside it. Only the group that actually owns the id proceeds.
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      drag.current = { startPointerY: e.clientY, lastPointerY: e.clientY, baseOffset: 0 };
      row.style.zIndex = "20";
      setDraggingId(id);
    }
    container.addEventListener("pointerdown", onDown);
    return () => container.removeEventListener("pointerdown", onDown);
  }, [disabled, order.length]);

  const dragDisabled = disabled || order.length < 2;

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {order.map((c) => (
        <div key={c.id} data-row-id={c.id} className="relative">
          {render(c, { isDragging: draggingId === c.id, dragDisabled })}
        </div>
      ))}
      {isPending && saving && (
        <p className="-mt-1 text-xs text-brown-800/70" aria-live="polite">
          Salvataggio ordine…
        </p>
      )}
    </div>
  );
}

/** The drag handle — its own element so touch-scrolling the page still works
 *  everywhere else on the card. `touch-none` is what stops the browser from
 *  treating a drag start as a scroll gesture on mobile. It carries no handler
 *  of its own: `data-drag-handle` + `data-row-id` are plain markers that the
 *  group's one delegated `pointerdown` listener (in `DragGroup`) reads. */
function DragHandle({ id, disabled }: { id: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      data-drag-handle={disabled ? undefined : ""}
      data-row-id={id}
      disabled={disabled}
      aria-label="Trascina per riordinare"
      title={disabled ? "Cancella la ricerca per riordinare" : undefined}
      className="grid size-11 shrink-0 touch-none place-items-center rounded-lg text-brown-800/70 hover:bg-brown-900/5 hover:text-brown-950 active:cursor-grabbing disabled:cursor-default disabled:text-brown-800/40 disabled:hover:bg-transparent"
      style={{ cursor: disabled ? "default" : "grab" }}
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * One category
 * ------------------------------------------------------------------------- */

function CategoryRow({
  c,
  kind,
  position,
  childCount,
  isDragging,
  dragDisabled,
}: {
  c: CategoryWithUsage;
  kind: KindMeta;
  position: { first: boolean; last: boolean };
  childCount: number;
  isDragging: boolean;
  dragDisabled: boolean;
}) {
  // The public page 404s on a hidden category, so the link is only offered
  // when it would open.
  const liveOnSite = kind.value === "product" && c.active;
  const usageHref = `${kind.listHref}?categoria=${encodeURIComponent(c.name)}`;

  return (
    <Panel
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
        isDragging ? "shadow-lg ring-1 ring-gold-dark/40" : ""
      }`}
    >
      <div className="flex items-center gap-1 sm:gap-2">
        <DragHandle id={c.id} disabled={dragDisabled} />
        <div>
          <p className="font-display text-lg text-brown-950">
            {c.parentId && <span className="text-brown-800/70">↳ </span>}
            {c.name}
          </p>
          <p className="text-xs text-brown-800/70">
            <code>/{c.slug}</code>
            {" · "}
            {c.usage > 0 ? (
              <Link href={usageHref} className="font-semibold underline">
                {countOf(c.usage, kind)}
              </Link>
            ) : (
              countOf(c.usage, kind)
            )}
            {childCount > 0 &&
              ` · ${childCount} ${childCount === 1 ? "sottocategoria" : "sottocategorie"}`}
            {c.defaultVatRateBps != null && ` · IVA ${vatRateLabel(c.defaultVatRateBps)}`}
            {` · ordine ${c.sortOrder}`}
          </p>
        </div>
        {!c.active && <StatusBadge status="hidden" />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Kept alongside the drag handle: a precise single-step move, and the
            only way to reorder for a keyboard or screen-reader operator. */}
        <ActionForm action={moveCategory} className="inline-flex">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="direction" value="up" />
          <PendingButton tone="dark" disabled={position.first}>
            <span aria-hidden="true">↑</span>
            <span className="sr-only">Sposta su</span>
          </PendingButton>
        </ActionForm>
        <ActionForm action={moveCategory} className="inline-flex">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="direction" value="down" />
          <PendingButton tone="dark" disabled={position.last}>
            <span aria-hidden="true">↓</span>
            <span className="sr-only">Sposta giù</span>
          </PendingButton>
        </ActionForm>

        <ActionForm action={toggleCategoryActive} className="inline-flex">
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="active" value={c.active ? "false" : "true"} />
          <PendingButton tone="dark">{c.active ? "Nascondi" : "Mostra"}</PendingButton>
        </ActionForm>

        <Link href={`${BASE}/${c.id}`} className={pillCls}>
          Modifica
        </Link>

        {liveOnSite && (
          <Link href={`/negozio/categoria/${c.slug}`} target="_blank" rel="noopener" className={pillCls}>
            Sito ↗
          </Link>
        )}

        {/* Deleting a category in use is refused by the foreign key itself.
            Hiding the button when it cannot succeed keeps the list honest — the
            merge tool below is the way out. */}
        {c.usage === 0 && (
          <DeleteForm
            action={deleteCategory}
            id={c.id}
            confirm={
              childCount > 0
                ? `Eliminare la categoria "${c.name}"? Le sue ${childCount} sottocategorie passeranno al primo livello.`
                : `Eliminare la categoria "${c.name}"?`
            }
          />
        )}
      </div>
    </Panel>
  );
}

/* ----------------------------------------------------------------------------
 * The list: top-level categories, each followed by its own draggable group of
 * children. `rows` is already tree-ordered (parents, then their children) by
 * the page, exactly like the static list this replaces.
 * ------------------------------------------------------------------------- */

export default function CategoryOrderList({
  kind,
  rows,
  childCounts,
  positions,
  searching,
}: {
  kind: KindMeta;
  rows: CategoryWithUsage[];
  childCounts: Record<string, number>;
  positions: Record<string, { first: boolean; last: boolean }>;
  searching: boolean;
}) {
  const roots = rows.filter((r) => !r.parentId);
  const childrenOf = (id: string) => rows.filter((r) => r.parentId === id);
  const pos = (id: string) => positions[id] ?? { first: true, last: true };

  return (
    <DragGroup
      kind={kind.value}
      parentId={null}
      items={roots}
      disabled={searching}
      render={(root, { isDragging, dragDisabled }) => {
        const kids = childrenOf(root.id);
        return (
          <div className="flex flex-col gap-3">
            <CategoryRow
              c={root}
              kind={kind}
              position={pos(root.id)}
              childCount={childCounts[root.id] ?? 0}
              isDragging={isDragging}
              dragDisabled={dragDisabled}
            />
            {kids.length > 0 && (
              <div className="pl-6 sm:pl-10">
                <DragGroup
                  kind={kind.value}
                  parentId={root.id}
                  items={kids}
                  disabled={searching}
                  render={(child, { isDragging: childDragging, dragDisabled: childDragDisabled }) => (
                    <CategoryRow
                      c={child}
                      kind={kind}
                      position={pos(child.id)}
                      childCount={0}
                      isDragging={childDragging}
                      dragDisabled={childDragDisabled}
                    />
                  )}
                />
              </div>
            )}
          </div>
        );
      }}
    />
  );
}
