"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";

type Me =
  | { signedIn: false }
  | { signedIn: true; name: string; points: number; emailVerified: boolean; hasEmail: boolean };

/**
 * The account control in the header.
 *
 * Fetched on the client rather than rendered from the session on the server, and
 * that is deliberate: `app/(site)/layout.tsx` wraps every storefront page, so
 * reading the session there would opt the whole site out of static rendering to
 * put a name in the corner. This costs one small request after hydration and
 * leaves the pages cacheable.
 *
 * Until the fetch resolves it renders exactly the icon-only link the header had
 * before, so there is no layout shift and no flash of a wrong state.
 */
export default function AccountBadge({ className }: { className?: string }) {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: Me) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        // A failed probe leaves the signed-out shell in place, which is the
        // safe default — never claim someone is logged in on a network error.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signedIn = me?.signedIn === true;
  const firstName = signedIn ? me.name.trim().split(/\s+/)[0] : "";

  return (
    <Link
      href="/account"
      aria-label={signedIn ? `Area personale di ${me.name}` : "Area personale"}
      title={signedIn ? `${me.points} punti` : undefined}
      className={cn(
        "relative flex items-center gap-2 rounded-full text-brown-700 transition-colors hover:bg-paper-warm hover:text-brown-950 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none",
        signedIn ? "h-11 px-3" : "size-11 justify-center",
        className,
      )}
    >
      <User className="size-[1.15rem] shrink-0" />
      {signedIn && (
        <>
          {/* The name is desktop-only: on a phone the header is already tight,
              and the points badge carries the "you are signed in" signal. */}
          <span className="hidden max-w-[9ch] truncate text-[0.6875rem] font-semibold tracking-[0.12em] uppercase lg:inline">
            {firstName}
          </span>
          <span className="flex min-w-[1.4rem] items-center justify-center rounded-full bg-gold px-1.5 py-0.5 text-[0.625rem] font-bold text-on-gold tabular-nums">
            {me.points}
          </span>
          {/* An unverified address is why order history and recovery silently
              don't work, so it gets a mark the customer can ask about rather
              than being buried on the account page. */}
          {me.hasEmail && !me.emailVerified && (
            <span
              aria-hidden
              title="Conferma il tuo indirizzo email"
              className="absolute top-1 right-1 size-2 rounded-full bg-danger"
            />
          )}
        </>
      )}
    </Link>
  );
}
