import { Suspense } from "react";

/**
 * The pieces of a list page that wait on the row query.
 *
 * Every admin list used to be a single server component, which meant Next.js
 * had nothing to show during a filter, sort or page change except the route's
 * `loading.tsx` — so clicking one dropdown replaced the header, the toolbar, the
 * active-filter chips and the saved views with three grey rectangles, including
 * the control that had just been used. Nothing on screen survived the click.
 *
 * The shape that fixes it is the same on every list: the page starts the row
 * query *without awaiting it*, awaits only the cheap chrome data (shops, saved
 * views, the operator's scope), and hands the pending promise to the two things
 * that genuinely need it — the table and the count in the header. Both live
 * behind Suspense, so the chrome renders on the first flush and only the rows
 * are ever in a loading state.
 *
 * Passing the *same* promise to both is what keeps this to one query. Awaiting
 * it twice would be two round trips; awaiting a shared promise twice is one.
 */

/** `320 ordini` — a list's row count, streamed in beside its title. */
async function Total({
  promise,
  one,
  many,
}: {
  promise: Promise<{ total: number }>;
  one: string;
  many: string;
}) {
  const { total } = await promise;
  return `${total.toLocaleString("it-IT")} ${total === 1 ? one : many}`;
}

/**
 * A header subtitle of the form "N cose", with the number arriving late.
 *
 * The fallback is the same string with the number blanked rather than something
 * shorter, so the header does not change height or reflow when the count lands.
 */
export function TotalSubtitle({
  promise,
  one,
  many,
  prefix,
  suffix,
}: {
  promise: Promise<{ total: number }>;
  one: string;
  /** Plural noun — also the fallback's width. */
  many: string;
  /** Anything that precedes the count and does not depend on the query. */
  prefix?: string;
  /** Anything that follows it, likewise. */
  suffix?: string;
}) {
  return (
    <>
      {prefix}
      <Suspense fallback={<span className="opacity-40">— {many}</span>}>
        <Total promise={promise} one={one} many={many} />
      </Suspense>
      {suffix}
    </>
  );
}
