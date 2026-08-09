"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * The referrer that brought the visitor to the site, or null.
 *
 * `document.referrer` is fixed by the browser when the document loads and is
 * *not* updated by App-Router client navigations. Reading it on every route
 * change therefore re-reported the original entry referrer for each internal
 * page, multiplying one arrival into a whole session's worth of "referrals".
 * A same-origin referrer (an internal full reload) is not an acquisition source
 * either, so it is dropped.
 */
function entryReferrer(): string | null {
  const raw = document.referrer;
  if (!raw) return null;
  try {
    if (new URL(raw).origin === window.location.origin) return null;
  } catch {
    return null;
  }
  return raw;
}

/**
 * First-party, cookieless page-view beacon. Sends the current pathname on each
 * route change to /api/analytics. No cookies, no identifiers — just a count.
 * Admin routes are never tracked (and the API drops them too, defence in depth).
 *
 * The referrer rides along only on the first beacon after a real document load
 * (see `entryReferrer`); subsequent client navigations report `null`.
 */
export default function Analytics() {
  const pathname = usePathname();
  // Survives client navigations because this component is mounted once in the
  // layout; a full reload remounts it and re-arms the referrer.
  const referrerPending = useRef(true);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    const referrer = referrerPending.current ? entryReferrer() : null;
    referrerPending.current = false;
    const payload = JSON.stringify({ path: pathname, referrer });

    try {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon?.("/api/analytics", blob)) return;
    } catch {
      // fall through to fetch
    }
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
