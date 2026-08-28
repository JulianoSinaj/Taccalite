"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * "You have unsaved changes" for the long admin forms.
 *
 * `ContentEditor` has guarded its single textarea since it was written; the
 * twenty-odd-field forms — a product, a shop, a manual order — had nothing, so
 * one click on the sidebar discarded the lot with no warning. This is that
 * guard, attached from `ActionForm` so a form opts in with one prop.
 *
 * Two exits have to be covered and they need different mechanisms:
 *
 *  - **Leaving the site** (reload, close, external link) — `beforeunload`. The
 *    browser draws its own dialog here; nothing else is allowed to.
 *  - **Leaving the page** (any `<Link>` in the shell) — a capture-phase click
 *    listener. This is the one that actually happens, and `beforeunload` does
 *    not fire for it: a client-side navigation never unloads the document. The
 *    click is cancelled, the destination remembered, and the navigation replayed
 *    through the router if the operator confirms.
 *
 * `window.confirm` is deliberately not used for the second case, for the reason
 * given in `ConfirmDialog`: a browser that has been told to block dialogs
 * suppresses it silently, turning the guard off without saying so.
 */
export function UnsavedGuard({ active, message }: { active: boolean; message: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      // Anything that isn't a plain left click is the browser's business:
      // ⌘-click and middle-click open a new tab and leave this page alone.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      // A download or a new tab doesn't take the form away.
      if (link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return; // beforeunload covers it
      if (url.href === window.location.href) return;
      e.preventDefault();
      setPending(url.pathname + url.search + url.hash);
    };
    // Capture, so this runs before Next's own router click handler and can stop
    // the navigation rather than race it.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);

  // Mounted only once a navigation has actually been intercepted, as in
  // ActionForm — otherwise every guarded form carries a closed <dialog>, with a
  // heading, in the markup of a page that will usually never show it.
  if (pending === null) return null;

  return (
    <ConfirmDialog
      open
      title="Modifiche non salvate"
      message={message}
      confirmLabel="Esci senza salvare"
      tone="danger"
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const href = pending;
        setPending(null);
        if (href) router.push(href);
      }}
    />
  );
}
