"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, User, UserCog } from "lucide-react";
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
 *
 * Signed *out* it stays that plain link. Signed in it becomes a menu, because a
 * link on its own left no way to leave: the only "Esci" on the storefront was
 * on `/account`, below the loyalty card, roughly 700px down a 5,000px page. A
 * customer on a shared or family device — which is most of them, for a shop —
 * had to already know it was there to get back to their own account. Logging out
 * is the other half of logging in and belongs in the same corner.
 */
export default function AccountBadge({ className }: { className?: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  // Dismissal: outside pointer, Esc. Esc also returns focus to the trigger,
  // which is the only way a keyboard user gets out without tabbing the length
  // of the menu.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    if (leaving) return;
    setLeaving(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // This component owns the only copy of the session state the header can
      // see, so clearing it here is what makes the badge go back to the
      // signed-out icon; `router.refresh()` alone re-renders the server tree
      // but never re-runs the `/api/auth/me` effect above.
      setMe({ signedIn: false });
      setOpen(false);
      router.refresh();
    } catch {
      setLeaving(false);
    }
  }

  const signedIn = me?.signedIn === true;
  const firstName = signedIn ? me.name.trim().split(/\s+/)[0] : "";
  const unverified = signedIn && me.hasEmail && !me.emailVerified;

  const face = (
    <>
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
          {unverified && (
            <span
              aria-hidden
              title="Conferma il tuo indirizzo email"
              className="absolute top-1 right-1 size-2 rounded-full bg-danger"
            />
          )}
        </>
      )}
    </>
  );

  const faceClass = cn(
    "relative flex items-center gap-2 rounded-full text-brown-700 transition-colors hover:bg-paper-warm hover:text-brown-950 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none",
    signedIn ? "h-11 px-3" : "size-11 justify-center",
    className,
  );

  // Signed out — unchanged. One tap to the sign-in form, no menu in the way of
  // the only thing there is to do.
  if (!signedIn) {
    return (
      <Link href="/account" aria-label="Area personale" className={faceClass}>
        {face}
      </Link>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account di ${me.name}`}
        title={`${me.points} punti`}
        className={cn(faceClass, open && "bg-paper-warm text-brown-950")}
      >
        {face}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          // Square and hairlined, like the rest of the storefront's chrome —
          // the rounded pill is the *control*, not the sheet under it.
          // Right-anchored: the badge sits in the last slot but one of the
          // header, so a left-anchored sheet would hang off the screen on a
          // phone.
          className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-56 border border-rule-strong bg-paper shadow-[0_18px_44px_-20px_rgba(42,26,16,0.45)]"
        >
          <div className="border-b border-rule px-4 py-3">
            <p className="truncate text-sm font-semibold text-brown-950">{me.name}</p>
            <p className="mt-0.5 text-[0.6875rem] tracking-[0.12em] text-taupe uppercase tabular-nums">
              {me.points} punti
            </p>
          </div>

          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-brown-950 transition-colors hover:bg-paper-warm focus-visible:bg-paper-warm focus-visible:outline-none"
          >
            <UserCog className="size-4 shrink-0 text-gold-deep" aria-hidden />
            Area personale
            {unverified && (
              <span aria-hidden className="ml-auto size-2 shrink-0 rounded-full bg-danger" />
            )}
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={logout}
            disabled={leaving}
            className="flex w-full items-center gap-3 border-t border-rule px-4 py-3.5 text-left text-sm font-medium text-brown-950 transition-colors hover:bg-paper-warm focus-visible:bg-paper-warm focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="size-4 shrink-0 text-gold-deep" aria-hidden />
            {leaving ? "Uscita…" : "Esci"}
          </button>
        </div>
      )}
    </div>
  );
}
