"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * First-party, cookieless page-view beacon. Sends the current pathname on each
 * route change to /api/analytics. No cookies, no identifiers — just a count.
 * Admin routes are never tracked (and the API drops them too, defence in depth).
 */
export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    const payload = JSON.stringify({ path: pathname, referrer: document.referrer || null });

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
