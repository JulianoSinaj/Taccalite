import { describe, expect, it } from "vitest";
import { pageWindow } from "@/components/admin/ui";

/**
 * The windowing behind the numbered paginator.
 *
 * The lists it serves are long — 24 pages of orders, 31 of the activity log —
 * so the two things that matter are that the ends are always reachable and that
 * the control does not change width as you page through it (buttons that move
 * under the pointer are worse than no buttons).
 */
describe("pageWindow", () => {
  it("lists every page when they all fit", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps first and last reachable from the middle", () => {
    const w = pageWindow(12, 24);
    expect(w[0]).toBe(1);
    expect(w.at(-1)).toBe(24);
    expect(w).toContain(12);
    // Elided on both sides.
    expect(w.filter((p) => p === null)).toHaveLength(2);
  });

  it("offers the same count of page numbers wherever you are", () => {
    // The buttons are what the pointer aims at, so their number must not change
    // as you page through; the ellipsis that comes and goes at the ends is a
    // two-character gap, not a target.
    const counts = [1, 2, 5, 12, 23, 24].map(
      (p) => pageWindow(p, 24).filter((n) => n !== null).length,
    );
    expect(new Set(counts)).toEqual(new Set([7]));
  });

  it("slides rather than shrinks at the ends", () => {
    // Near the start there is nothing to elide on the left…
    const first = pageWindow(1, 31);
    expect(first.slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(first.at(-1)).toBe(31);
    // …and nothing on the right at the end.
    const last = pageWindow(31, 31);
    expect(last[0]).toBe(1);
    expect(last.slice(-6)).toEqual([26, 27, 28, 29, 30, 31]);
  });

  it("never repeats a page", () => {
    for (const total of [8, 9, 15, 24, 31, 100]) {
      for (let p = 1; p <= total; p++) {
        const nums = pageWindow(p, total).filter((n): n is number => n !== null);
        expect(new Set(nums).size).toBe(nums.length);
        expect(nums).toContain(p);
      }
    }
  });
});
